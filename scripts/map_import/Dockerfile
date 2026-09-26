FROM ghcr.io/osgeo/gdal:ubuntu-full-3.11.4@sha256:ddf2d45467bc7d17172305e5f49fd4539dc5c62ffa512ae45c205f74f2f7de02
RUN apt-get update && apt-get install -y --no-install-recommends python3-pip && python3 -m pip install --no-cache-dir --break-system-packages shapely==2.1.2 osmium==4.1.1
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/app/import_map.py", "convert"]
