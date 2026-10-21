FROM ghcr.io/osgeo/gdal:ubuntu-full-3.13.3@sha256:2dd0f81ef927ff4c3d4dbe4f73c029dc86d4073974c0564f8e196f6e1412e2e0 AS base
COPY requirements.lock /requirements.lock
RUN apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" update \
 && apt-get -o Dir::Etc::sourcelist="sources.list.d/ubuntu.sources" -o Dir::Etc::sourceparts="-" install -y --no-install-recommends python3-venv \
 && python3 -m venv --system-site-packages /opt/venv \
 && /opt/venv/bin/python -m pip install --no-cache-dir --require-hashes -r /requirements.lock
COPY process.py /app/process.py
ENV PYTHONDONTWRITEBYTECODE=1 PROJ_NETWORK=OFF PATH="/opt/venv/bin:${PATH}"
ENTRYPOINT ["python3", "/app/process.py"]

FROM base AS test
COPY requirements-test.lock /requirements-test.lock
RUN python3 -m pip install --no-cache-dir --require-hashes -r /requirements-test.lock

FROM base AS runtime
