FROM registry.access.redhat.com/ubi8/nodejs-14
ARG ADDPKGS=""
ARG NPMLOCATION="open"
ARG ANCHORS=""
USER root
RUN yum install -y "krb5-workstation" $ADDPKGS && \
    yum clean all -y
COPY rhcachain.crt "$HOME/"
RUN trust anchor --store "${HOME}/rhcachain.crt"
# OSCI-2964
RUN sed -i -e '/dns_canonicalize_hostname/d;/^\[libdefaults\]/a\ \ dns_canonicalize_hostname = fallback' /etc/krb5.conf
COPY "src" "$HOME/src/"
COPY "assets" "$HOME/assets/"
COPY "package.json" "package-lock.json" "env.sh" "tsconfig.json" "$HOME/"
RUN echo "Use location: $NPMLOCATION"
COPY ".npmrcs/$NPMLOCATION" ".npmrc"

# USER doesn't impact on COPY
USER 1001
RUN ["bash","-c", "--", "npm install"]
RUN ["bash","-c", "--", "npm run build"]
# Provide defaults for an executing container
# Later, helm-chart will set 'NPM_RUN' variable to 'start:server'
CMD ["bash","-c", "--", "$STI_SCRIPTS_PATH/run"]

# Local debug
#
# Build with:
# buildah bud --build-arg 'NPMLOCATION=work' --no-cache=true -t ciboard-server:local .
#
# Inspect image with:
# podman run -ti  --user 0:0  --rm --entrypoint sh localhost/ciboard-server:local
