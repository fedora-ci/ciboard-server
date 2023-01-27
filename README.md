# CI Dashboard Server for CentOS Stream, Fedora, and other builds

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

 1. Clone repo

 2. Run `npm install`

 3. Configure `env-devel.sh` file:

```bash
#!/bin/bash  
# development  
export SRV_KOJI_BREW_HOST="brewhub.engineering.redhat.com"  
export SRV_DISTGIT_RH_BASE_URL="http://pkgs.devel.redhat.com"  
export SRV_GREENWAVE_URL='https://greenwave.engineering.redhat.com'  
export SRV_WAIVERDB_URL='https://waiverdb.engineering.redhat.com'
```

 4. Setup container running MongoDB:

```bash
podman run -p 27017:27017 -e MONGODB_USERNAME=user -e MONGODB_PASSWORD=password -e MONGODB_DATABASE=ci-messages -e MONGODB_ROOT_PASSWORD=passwordrootmongodb bitnami/mongodb:latest
```

 5. Start the server:

```bash
SRV_DB_URL='mongodb://root:passwordrootmongodb@127.0.0.1' DEBUG="osci:*" npm run dev:server
```

**Optional step:** use official read only database `SRV_DB_URL` provided by OSCI team:

```bash
RV_DB_DB_NAME="oscidashboard" SRV_DB_URL='mongodb://oscidashboardro_user:XXXXX@dbproxy01.dba-001.prod.iad2.dc.redhat.com:32701/oscidashboard?authSource=admin&tls=true&tlsInsecure=true&replicaSet=mongoshared7&directConnection=true' DEBUG="osci:*" npm run dev:server
```

## Code style

In this project we follow the  [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).
