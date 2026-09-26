FROM ghcr.io/osgeo/gdal:ubuntu-full-3.11.4@sha256:ddf2d45467bc7d17172305e5f49fd4539dc5c62ffa512ae45c205f74f2f7de02
# Only the signed Ubuntu repository is needed for pip. The pinned GDAL image's
# optional Arrow repository has its own key lifecycle and is not a dependency.
RUN apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" update \
 && apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" install -y --no-install-recommends python3-pip \
 && python3 -m pip install --no-cache-dir --break-system-packages shapely==2.1.2 osmium==4.1.1
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/app/import_map.py", "convert"]
