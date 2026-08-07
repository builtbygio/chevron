# Chevron build/dev image — matches host toolchain used by CI and bootstrap-modern.
# Node 24 + Python 3.12 (+ setuptools) for node-gyp / native rebuilds.
#
# Example:
#   docker build -t chevron-build .
#   docker run --rm -it -v "$PWD":/chevron -w /chevron chevron-build \
#     bash -lc './script/bootstrap-modern && ./script/with-modern-env ./script/build --no-bootstrap'
#
# Prefer native host builds for daily work; this image is for reproducible Linux builds.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=24 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        fakeroot \
        git \
        gnupg \
        libasound2-dev \
        libgbm-dev \
        libgtk-3-dev \
        libnotify-dev \
        libnss3 \
        libsecret-1-dev \
        libx11-dev \
        libxkbfile-dev \
        libxss-dev \
        pkg-config \
        python3 \
        python3-pip \
        python3-setuptools \
        python3-venv \
        rpm \
        xvfb \
    && rm -rf /var/lib/apt/lists/*

# Node 24 from NodeSource (matches CI / .nvmrc)
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node -v && npm -v

# distutils/setuptools for node-gyp on packages that still expect them
RUN python3 -m pip install --break-system-packages --upgrade pip setuptools \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /chevron

# Do not default to stock script/bootstrap — that path is legacy.
CMD ["bash"]
