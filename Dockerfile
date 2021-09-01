FROM registry.access.redhat.com/ubi8/nodejs-14
USER root
ARG ADDPKGS
RUN yum install -y krb5-workstation $ADDPKGS && \
    yum clean all -y
USER 1001
COPY src $HOME/src/
COPY assets $HOME/assets/
COPY package.json package-lock.json env.sh tsconfig.json $HOME/
ARG NPMLOCATION="open"
COPY .npmrcs/$NPMLOCATION .npmrc
RUN ["bash","-c", "--", "npm install"]
RUN ["bash","-c", "--", "npm run build"]
CMD ["bash","-c", "--", "$STI_SCRIPTS_PATH/run"]
