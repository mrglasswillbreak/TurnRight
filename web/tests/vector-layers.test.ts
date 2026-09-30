import { describe, expect, it } from 'vitest';
import type { Feature, FeatureCollection } from 'geojson';
import { exposedRoads } from '../src/road-surfaces';
import { displayGeometry } from '../src/map-display';
import { validateEdit, applyEdits } from '../src/editor-model';
import { emptyCampus, lasuCampus } from '../src/campus-context';
import { importConfiguration } from '../server/map-imports';
import { supportedMapFilename } from '../src/map-formats';

const surface: Feature = {type:'Feature',properties:{id:'surface:96',kind:'land',name:'Tarred-Road',landClass:'road'},geometry:{type:'Polygon',coordinates:[[[3.20,6.47],[3.202,6.47],[3.202,6.472],[3.20,6.472],[3.20,6.47]],[[3.2008,6.4708],[3.2012,6.4708],[3.2012,6.4712],[3.2008,6.4712],[3.2008,6.4708]]]}};
const line: Feature = {type:'Feature',properties:{id:'path:1',kind:'path'},geometry:{type:'LineString',coordinates:[[3.199,6.471],[3.203,6.471]]}};
describe('vector map presentation and editing', () => {
  it('clips only display linework, retains uncovered segments and courtyard holes', () => {
    const map: FeatureCollection = {type:'FeatureCollection',features:[surface,line]};
    const before=JSON.stringify(map), result=exposedRoads(map);
    expect(result.features[0].geometry.type).toBe('MultiLineString');
    if(result.features[0].geometry.type==='MultiLineString') {
      expect(result.features[0].geometry.coordinates).toHaveLength(3);
      expect(result.features[0].geometry.coordinates[1][0][0]).toBeCloseTo(3.2008,8);
    }
    expect(result.features[0].properties?.id).toBe('path:1');
    expect(JSON.stringify(map)).toBe(before);
    expect(exposedRoads(map)).toBe(result);
  });
  it('classifies existing UNILAG vegetation and surfaces without modifying data', () => {
    const names=['TreeLine','HedgeRow','ShrubLine','Drive-Unpaved','Sidewalk'];
    const map: FeatureCollection={type:'FeatureCollection',features:names.map(name=>({...surface,properties:{kind:'land',name}}))};
    const display=displayGeometry(map);
    expect(display.features.map(f=>f.properties?.landClass)).toEqual(['green','green','green','road','sidewalk']);
    expect(display.features[3].properties?.unpaved).toBe(true);
    expect(map.features[0].properties?.landClass).toBeUndefined();
  });
  it('edits land and overlays without changing the routing graph', () => {
    const base=emptyCampus(lasuCampus);
    base.map.features=[surface,line];
    const edit={id:'surface:96',kind:'land' as const,geometry:surface.geometry,properties:{name:'Road',landClass:'road',surface:'paved',visible:false}};
    expect(validateEdit(edit,base)).toEqual([]);
    const result=applyEdits(base,[edit]);
    expect(result.data.map.features.find(f=>f.properties?.id===edit.id)?.properties?.visible).toBe(false);
    expect(result.data.graph).toEqual(base.graph);
    expect(validateEdit({...edit,properties:{...edit.properties,opacity:2}},base)).toContain('Layer opacity must be between 0 and 1.');
  });
  it('shares expanded upload capabilities and validates refresh/style options', () => {
    for (const filename of ['Road width.geojson.json','map.gdb.zip','places.ndjson','terrain.fgb','area.gml','site.dxf','survey.parquet','roads.shx','campus.tab']) expect(supportedMapFilename(filename)).toBe(true);
    expect(supportedMapFilename('image.tif')).toBe(false);
    const c={layers:[{layer:'roads',role:'road-surface',widthField:'WIDTH',widthUnit:'ft'}],attribution:'Survey',license:'Owner permission',redistributionConfirmed:true,refreshMode:'merge'};
    expect(importConfiguration(c).layers[0].role).toBe('road-surface');
    expect(()=>importConfiguration({...c,refreshMode:'erase'})).toThrow();
  });
});
