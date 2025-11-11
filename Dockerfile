# Based on https://github.com/sclorg/s2i-nodejs-container
FROM registry.access.redhat.com/ubi8/nodejs-18

# Additional packages to install before the build.
ARG ADDPKGS=
# npm mirror to use to install dependencies.
ARG NPMLOCATION=open
# Upstream Git commit from which this image is being built.
ARG GITCOMMIT=

ENV CIBOARD_SERVER_GIT_COMMIT $GITCOMMIT

USER root
RUN dnf install --assumeyes krb5-workstation libpq $ADDPKGS && \
    dnf clean all --assumeyes

COPY linux-krb5.conf /etc/krb5.conf
COPY rhca.crt ./
RUN trust anchor --store "$HOME/rhca.crt"

COPY assets/ $HOME/assets/
COPY src/ $HOME/src/
COPY package.json package-lock.json env.sh tsconfig.json $HOME/
COPY .npmrcs/$NPMLOCATION .npmrc
RUN chmod a+w "$HOME/package-lock.json"


# USER doesn't impact on COPY
USER 1001

WORKDIR $HOME
RUN if [ -z "$GITCOMMIT" ]; then \
        echo "Custom build from local repo"; \
    else \
        echo "Building from commit $GITCOMMIT"; \
    fi && \
    echo "Using npm location: $NPMLOCATION" && \
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
