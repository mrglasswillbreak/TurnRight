FROM mcr.microsoft.com/devcontainers/python:3.15-bookworm@sha256:25ac34e3c1a4c5b19a89ece73ed0278e92afc1cfd25ecb51714891e82bede421
ARG NODE_VERSION=22.23.3
RUN curl -fsSLO https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
 && curl -fsSLO https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt \
 && grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum --check \
 && tar -xJf node-v${NODE_VERSION}-linux-x64.tar.xz -C /usr/local --strip-components=1 \
 && rm node-v${NODE_VERSION}-linux-x64.tar.xz SHASUMS256.txt
# This npm workspace does not use the base image's optional Yarn repository.
# Keep apt signature verification enabled for the Debian packages we install.
RUN rm -f /etc/apt/sources.list.d/yarn.list \
 && apt-get update && apt-get install -y --no-install-recommends docker.io \
 && rm -rf /var/lib/apt/lists/*
CMD ["bash"]
