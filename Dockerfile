FROM registry.access.redhat.com/ubi8/nodejs-14 as frontend
ARG FRONTEND_REPO="https://github.com/fedora-ci/ciboard.git"
ARG FRONTEND_BRANCH="main"
ARG NPMLOCATION="open"
RUN git clone --branch "$FRONTEND_BRANCH" "$FRONTEND_REPO"
WORKDIR "ciboard"
RUN echo "Use location: $NPMLOCATION"
COPY ".npmrcs/$NPMLOCATION" ".npmrc"
RUN ["bash","-c", "--", "npm install"]
RUN ["bash","-c", "--", "npm run build"]

FROM registry.access.redhat.com/ubi8/nodejs-14
ARG ADDPKGS=""
ARG NPMLOCATION="open"
USER root
RUN yum install -y "krb5-workstation" $ADDPKGS && \
    yum clean all -y
USER 1001
COPY "src" "$HOME/src/"
COPY "assets" "$HOME/assets/"
COPY "package.json" "package-lock.json" "env.sh" "tsconfig.json" "$HOME/"
RUN echo "Use location: $NPMLOCATION"
COPY ".npmrcs/$NPMLOCATION" ".npmrc"
RUN ["bash","-c", "--", "npm install"]
RUN ["bash","-c", "--", "npm run build"]

# Acquire the freshest snapshot of the dashboard
COPY --from=frontend "/opt/app-root/src/ciboard/build" "$HOME/build/frontend/"

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
