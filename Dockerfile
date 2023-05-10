# Based on https://github.com/sclorg/s2i-nodejs-container
FROM quay.io/sclorg/nodejs-18-c8s

# Additional packages to install before the build.
ARG ADDPKGS=
# npm mirror to use to install dependencies.
ARG NPMLOCATION=open

USER root

RUN dnf install --assumeyes krb5-workstation postgresql $ADDPKGS && \
    dnf clean all --assumeyes

# OSCI-4966
COPY linux-krb5.conf /etc/krb5.conf
RUN sed -i -e '/default_ccache_name/d' -e '/^\[libdefaults/a\ \ default_ccache_name = FILE:/tmp/krb5cc_%{uid}' /etc/krb5.conf 

COPY rhcachain.crt ./
RUN trust anchor --store "$HOME/rhcachain.crt"

COPY assets/ $HOME/assets/
COPY src/ $HOME/src/
COPY package.json package-lock.json env.sh tsconfig.json $HOME/
COPY .npmrcs/$NPMLOCATION .npmrc
RUN chmod a+w "$HOME/package-lock.json"

# USER doesn't impact on COPY
USER 1001

WORKDIR $HOME
RUN echo "Using npm location: $NPMLOCATION" && \
    npm install && \
    npm run build && \
    # cache folder contains root-owned files, due to a bug in npm, \
    # previous versions of npm which has since been addressed. \
    chown -R 1001:0 "$HOME/.npm"

# Provide defaults for an executing container
# Later, helm-chart will set 'NPM_RUN' variable to 'start:server'
CMD ["/bin/sh", "-c", "--", "$STI_SCRIPTS_PATH/run"]

# Local debug
#
# Build with:
# buildah bud --build-arg 'NPMLOCATION=work' --no-cache=true -t ciboard-server:local .
#
# Inspect image with:
# podman run -ti  --user 0:0  --rm --entrypoint sh localhost/ciboard-server:local
