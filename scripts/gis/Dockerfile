FROM ghcr.io/osgeo/gdal:ubuntu-full-3.11.4@sha256:ddf2d45467bc7d17172305e5f49fd4539dc5c62ffa512ae45c205f74f2f7de02
RUN apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" update \
 && apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" install -y --no-install-recommends python3-pip \
 && python3 -m pip install --no-cache-dir --break-system-packages shapely==2.1.2 pyproj==3.7.2
COPY process.py /app/process.py
ENV PYTHONDONTWRITEBYTECODE=1 PROJ_NETWORK=OFF
ENTRYPOINT ["python3", "/app/process.py"]
