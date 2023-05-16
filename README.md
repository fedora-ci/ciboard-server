# CI Dashboard Server for CentOS Stream, Fedora, and other builds

![Check build](https://github.com/fedora-ci/ciboard-server/actions/workflows/build.yaml/badge.svg)

## Architecture

The following diagram lays out the high-level architecture of CI Dashboard and its component packages:

```mermaid
graph TB

umb-listener --> bus[Message bus]:::outside

subgraph kaijs
umb-listener[UMB listener] --> queue[Filesystem queue]
fedmsg-listener[fedmsg listener] --> queue
Loader --> queue
end

Loader --> db[MongoDB]
server["ciboard-server<br>(backend)"]:::focus --> db
ciboard["ciboard<br>(frontend)"] --> server

click ciboard "https://github.com/fedora-ci/ciboard/" "ciboard GitHub repositotry" _blank
click server "https://github.com/fedora-ci/ciboard-server/" "ciboard-server GitHub repositotry" _blank
click kaijs "https://github.com/fedora-ci/kaijs/" "kaijs GitHub repositotry" _blank

classDef focus stroke-width: 4
classDef outside stroke-dasharray: 4
```

## Enviroment setup

Install certificates

```bash
yum install https://hdn.corp.redhat.com/rhel8-csb/RPMS/noarch/redhat-internal-cert-install-0.1-28.el7.noarch.rpm
```

Install globally npmrc and create config file

```bash
npm install -g npmrc
echo registry=https://repository.engineering.redhat.com/nexus/repository/registry.npmjs.org/ strict-ssl=false prefix=/home/$(whoami)/.npm-packages > ".npmrcs/osci"
npmrc osci
```

**Note:** if using nvm for node, export `NODE_TLS_REJECT_UNAUTHORIZED=0` before every start.

## Development

To set up server process this steps:

1.  Clone repo

2.  Run `npm install`

3.  Configure `env-devel.sh` file:

```bash
#!/bin/bash
# development
export SRV_KOJI_BREW_HOST="brewhub.engineering.redhat.com"
export SRV_DISTGIT_RH_BASE_URL="http://pkgs.devel.redhat.com"
export SRV_GREENWAVE_URL="https://greenwave.engineering.redhat.com"
export SRV_WAIVERDB_URL="https://waiverdb.engineering.redhat.com"
```

4.  Setup container running MongoDB:

```bash
podman run -p 27017:27017 -e MONGODB_USERNAME=user -e MONGODB_PASSWORD=password -e MONGODB_DATABASE=ci-messages -e MONGODB_ROOT_PASSWORD=passwordrootmongodb bitnami/mongodb:latest
```

5.  Start the server:

```bash
SRV_DB_URL='mongodb://root:passwordrootmongodb@127.0.0.1' DEBUG="osci:*" npm run dev:server
```

**Optional step:** use official read only database `SRV_DB_URL` provided by OSCI team:

```bash
SRV_DB_DB_NAME="oscidashboard" SRV_DB_URL='mongodb://oscidashboardro_user:XXXXX@dbproxy01.dba-001.prod.iad2.dc.redhat.com:32701/oscidashboard?authSource=admin&tls=true&tlsInsecure=true&replicaSet=mongoshared7&directConnection=true' DEBUG="osci:*" npm run dev:server
```

## Sentry integration

CI Dashboard outputs all log messages to the console. In addition to this, it is able to report runtime as well as GraphQL directly to Sentry. To specify the [Sentry DSN](https://docs.sentry.io/product/sentry-basics/dsn-explainer/) and [environment identifier](https://docs.sentry.io/product/sentry-basics/environments/), use the `SENTRY_DSN` and `SENTRY_ENVIRONMENT` environment variables. You can specify these in your `env.sh` or `env-devel.sh` file, for example:

```bash
# ...
export SENTRY_DSN=https://1cafe2cafe3cafe@example.sentry.io/9999999
export SENTRY_ENVIRONMENT=production
```

If the DSN is not specified, messages are only logged to the console.

## Code style

In this project we follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).

## License

This project is licensed under the LGPLv3 License or later - see the [LICENSE](/COPYING) file for details
