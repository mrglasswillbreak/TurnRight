"""Bounded Overture extraction using asset paths when STAC collection is null.

The August 2026 index has a null `collection` column. Filtering it by feature
type silently returns zero rows in overturemaps 1.0.2. Match the typed asset path,
then apply the recorded file extent and parquet row bbox filters independently.
"""
import argparse
import io
import json
import pathlib
import urllib.request
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
from overturemaps.core import _record_batch_reader_from_dataset
from overturemaps.writers import copy, get_writer


class RangeFile(io.RawIOBase):
    """Read only selected parquet byte ranges, with response and transfer limits."""
    def __init__(self, url):
        self.url, self.position, self.transferred = url, 0, 0
        self.cache_start, self.cache = 0, b''
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=-8'}), timeout=30) as response:
            if response.status != 206: raise ValueError('Source did not support bounded range reads')
            self.length = int(response.headers['Content-Range'].split('/')[-1])
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.length + offset
        if not 0 <= self.position <= self.length: raise ValueError('Invalid source range')
        return self.position
    def read(self, size=-1):
        size = min(self.length-self.position, size if size >= 0 else self.length-self.position)
        if size == 0: return b''
        if self.cache_start <= self.position and self.position+size <= self.cache_start+len(self.cache):
            start=self.position-self.cache_start
            self.position+=size
            return self.cache[start:start+size]
        if size > 32_000_000 or self.transferred + size > 200_000_000: raise ValueError('Campus source transfer budget exceeded')
        start=self.position
        with urllib.request.urlopen(urllib.request.Request(self.url, headers={'Range': f'bytes={start}-{start+size-1}'}), timeout=30) as response:
            if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{start+size-1}/{self.length}': raise ValueError('Incorrect source byte range')
            content=response.read(size+1)
        if len(content)!=size: raise ValueError('Truncated source byte range')
        self.position+=size
        self.transferred+=size
        return content
    def prefetch(self, start, size):
        previous=self.position
        self.seek(start)
        content=self.read(size)
        self.cache_start,self.cache=start,content
        self.seek(previous)


def matching_assets(rows, kind, release, bbox):
    west,south,east,north = bbox
    matches, theme_seen = [], False
    for row in rows:
        asset = (row.get('assets') or {}).get('aws') or {}
        href = ((asset.get('alternate') or {}).get('s3') or {}).get('href', '')
        if f'/release/{release}/' not in href or f'/type={kind}/' not in href:
            continue
        if not href.startswith('s3://overturemaps-us-west-2/'):
            raise ValueError('Unexpected Overture asset host')
        theme_seen = True
        b = row.get('bbox')
        if not isinstance(b, dict) or any(k not in b for k in ('xmin','ymin','xmax','ymax')):
            raise ValueError('Missing Overture file bounds')
        if b['xmin'] < east and b['xmax'] > west and b['ymin'] < north and b['ymax'] > south:
            matches.append(href[len('s3://'):])
    if not theme_seen:
        raise ValueError('Overture index lacks requested theme; cannot establish empty coverage')
    return sorted(set(matches))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=['place','building','segment','connector'],required=True)
    parser.add_argument('--release',required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    args=parser.parse_args()
    bbox=(3.190,6.455,3.215,6.489)
    index=args.output.parent/'collections.parquet'
    if not index.exists():
        with urllib.request.urlopen(f'https://stac.overturemaps.org/{args.release}/collections.parquet',timeout=60) as response:
            content=response.read(30_000_001)
        if len(content)>30_000_000: raise ValueError('Overture index exceeds size limit')
        pq.read_table(io.BytesIO(content))
        pending=index.with_suffix('.tmp')
        pending.write_bytes(content)
        pending.replace(index)
    files=matching_assets(pq.read_table(index,columns=['assets','bbox']).to_pylist(),args.kind,args.release,bbox)
    print(f'{args.kind}: {len(files)} spatially selected source files',flush=True)
    if not files:
        args.output.write_text(json.dumps({'type':'FeatureCollection','features':[]}),encoding='utf-8')
        return
    west,south,east,north=bbox
    condition=(pc.field('bbox','xmin')<east)&(pc.field('bbox','xmax')>west)&(pc.field('bbox','ymin')<north)&(pc.field('bbox','ymax')>south)
    tables=[]
    for file in files:
        url='https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/'+file.split('/',1)[1]
        with RangeFile(url) as stream:
            parquet=pq.ParquetFile(stream,pre_buffer=False)
            indices={parquet.metadata.schema.column(i).path:i for i in range(parquet.metadata.num_columns)}
            for key in ('xmin','xmax','ymin','ymax'):
                if 'bbox.'+key not in indices: raise ValueError('Source lacks spatial columns')
            groups=[]
            for i in range(parquet.metadata.num_row_groups):
                stats={key:parquet.metadata.row_group(i).column(indices['bbox.'+key]).statistics for key in ('xmin','xmax','ymin','ymax')}
                if any(s is None or not s.has_min_max for s in stats.values()): raise ValueError('Source lacks spatial statistics; refusing an unbounded scan')
                if stats['xmin'].min < east and stats['xmax'].max > west and stats['ymin'].min < north and stats['ymax'].max > south: groups.append(i)
            for group in groups:
                print(f'{args.kind}: reading matching row group {group+1}/{parquet.metadata.num_row_groups}',flush=True)
                # Fetch the selected row group in one bounded request instead
                # of a new TLS connection for every nested property column.
                columns=[parquet.metadata.row_group(group).column(i) for i in range(parquet.metadata.num_columns)]
                starts=[c.dictionary_page_offset if c.has_dictionary_page else c.data_page_offset for c in columns]
                start=min(starts)
                end=max(offset+c.total_compressed_size for offset,c in zip(starts,columns))
                stream.prefetch(start,end-start)
                table=parquet.read_row_group(group,use_threads=False)
                table=ds.dataset(table).to_table(filter=condition)
                if table.num_rows: tables.append(table)
    if not tables:
        args.output.write_text(json.dumps({'type':'FeatureCollection','features':[]}),encoding='utf-8')
        return
    dataset=ds.dataset(pa.concat_tables(tables))
    reader=_record_batch_reader_from_dataset(dataset)
    if reader is None: raise ValueError('Overture reader failed')
    with get_writer('geojson',str(args.output),schema=reader.schema) as writer:
        copy(reader,writer)
    print(f'{args.kind}: completed bounded extraction from {len(files)} spatially selected files')


if __name__ == '__main__': main()
