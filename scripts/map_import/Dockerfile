FROM ghcr.io/osgeo/gdal:ubuntu-full-3.11.4@sha256:ddf2d45467bc7d17172305e5f49fd4539dc5c62ffa512ae45c205f74f2f7de02 AS base
# Only the signed Ubuntu repository is needed for pip. The pinned GDAL image's
# optional Arrow repository has its own key lifecycle and is not a dependency.
COPY requirements.lock /requirements.lock
RUN apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" update \
 && apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" install -y --no-install-recommends python3-venv \
 && python3 -m venv --system-site-packages /opt/venv \
 && /opt/venv/bin/python -m pip install --no-cache-dir --require-hashes -r /requirements.lock
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:${PATH}"
ENTRYPOINT ["python3", "/app/import_map.py", "convert"]

FROM base AS test
COPY requirements-test.lock /requirements-test.lock
RUN python3 -m pip install --no-cache-dir --require-hashes -r /requirements-test.lock

FROM base AS runtime
