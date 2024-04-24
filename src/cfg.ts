/*
 * This file is part of kaijs

 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import debug from 'debug';
import yaml from 'js-yaml';
import assert from 'assert';
import { URL } from 'url';
import { SamlConfig } from 'passport-saml/lib/passport-saml';
import { ClientOptions } from '@opensearch-project/opensearch/.';

const log = debug('osci:cfg');
/** Default config must present */
const DEF_CFG_FILENAME = 'config-default.yaml';
const DEF_CFG_PATH = path.join(__dirname, '../assets', DEF_CFG_FILENAME);
assert.strictEqual(
  fs.existsSync(DEF_CFG_PATH),
  true,
  `Default configuration is absent at ${DEF_CFG_PATH}, cannot continue.`,
);
/** Additional config with overriden params */
const OVERRIDE_CFG_FILENAME = 'config-server.yaml';
const OVERRIDE_CFG_LOOKUP_DIRS = [
  process.cwd(),
  path.join(__dirname, '../assets'),
];
const OVERRIDE_CFG_LOOKUP_PATHS = _.map(OVERRIDE_CFG_LOOKUP_DIRS, (d) =>
  path.join(d, OVERRIDE_CFG_FILENAME),
);
if (process.env.OSCI_SERVER_CFG_PATH) {
  OVERRIDE_CFG_LOOKUP_PATHS.unshift(process.env.OSCI_SERVER_CFG_PATH);
}
log('Config lookup priority paths:');
for (const cfgpath of OVERRIDE_CFG_LOOKUP_PATHS) {
  log(cfgpath);
}

export const mk_config_from_env = (
  envToConfigMap?: object,
): object | undefined => {
  if (!envToConfigMap) return;
  const entries = Object.entries(envToConfigMap);
  const envEntries: ([string, string | string[]] | undefined)[] = entries.map(
    ([key, value]) => {
      /*
       * For arrays, the first entry determines the name of the environment variable
       * to parse. If the environment variable is present, each line of its value is
       * an entry of the resulting array. If there are no entries, skip it.
       */
      if (_.isArray(value)) {
        const envValue = _.get(process.env, _.first(value));
        let newValue: string[] = [];
        if (!_.isUndefined(envValue)) newValue = envValue.trim().split('\n');
        if (!_.isEmpty(newValue)) return [key, newValue];
      }
      /*
       * Objects are traversed recursively. If an empty object is returned,
       * discard it.
       */
      if (_.isPlainObject(value)) {
        const newValue = mk_config_from_env(value);
        if (!_.isEmpty(newValue)) return [key, newValue];
      }
      /*
       * Interpret pure strings as environment variable names and try to get their
       * value, if set.
       */
      if (_.isString(value)) {
        const envValue = _.get(process.env, value);
        if (!_.isUndefined(envValue)) return [key, envValue];
      }
    },
  );
  /*
   * Remove `undefined` values and construct a map from the array of key-value pairs.
   */
  return Object.fromEntries(_.compact(envEntries));
};

type YamlItem = string | number | object | null | undefined | unknown;

class Config {
  private config_default: YamlItem;
  private config_override: YamlItem = {};
  private config_from_env: YamlItem = {};
  public config_active: YamlItem = {};
  constructor() {
    try {
      const def_cfg_contents = fs.readFileSync(DEF_CFG_PATH, 'utf8');
      this.config_default = yaml.load(def_cfg_contents);
    } catch (err) {
      console.warn('Cannot proceed default configuration: ', DEF_CFG_PATH);
      throw err;
    }
    //log('Default config: %s', '\n' + yaml.dump(this.config_default));
    var override_cfg_path: string;
    for (override_cfg_path of OVERRIDE_CFG_LOOKUP_PATHS) {
      log(override_cfg_path);
      if (fs.existsSync(override_cfg_path)) {
        log('Read overide configuration from file: %s', override_cfg_path);
        try {
          const override_cfg_contents = fs.readFileSync(
            override_cfg_path,
            'utf8',
          );
          this.config_override = yaml.load(override_cfg_contents);
          log('Override config: %s', '\n' + yaml.dump(this.config_override));
          break;
        } catch (err) {
          /** ignore */
        }
      }
    }
    if (this.config_default != null && typeof this.config_default == 'object') {
      const env_to_config_map = _.get(this.config_default, 'env_to_config_map');
      this.config_from_env = mk_config_from_env(env_to_config_map);
      /**
       * Uncomment to print Environment config
       */
      //log('Environment config: %s', '\n' + yaml.dump(this.config_from_env));
    }
    /** Priority order */
    _.defaultsDeep(
      this.config_active,
      this.config_from_env,
      this.config_override,
      this.config_default,
    );
    _.unset(this.config_active, 'env_to_config_map');
    /**
     * Uncomment to print whole active config
     */
    log('Active config: %s', '\n' + yaml.dump(this.config_active));
    /** constructor in javascript returns this object automatically
     * constructor returns the type of the class, the constructor implicitly returns 'this'
     * Even though you technically can't extend a proxy, there is a way to force a class
     * to instantiate as a proxy.
     * https://stackoverflow.com/questions/37714787/can-i-extend-proxy-with-an-es2015-class/40714458#40714458
     */
    const handler = {
      get: (target: Config, prop: string): YamlItem => {
        return _.get(target.config_active, prop);
      },
    };
    return new Proxy(this, handler);
  }
}

export const getcfg = _.once((): Cfg => {
  return new Config() as unknown as Cfg;
});

export type MbsInstance = 'cs' | 'fp' | 'rh';

export interface MbsInstanceConfig {
  url: string;
}

export interface Cfg {
  port: number;
  cookieKey: string;
  authz: {
    enabled: boolean;
    use_saml: boolean;
    saml: SamlConfig;
  };
  greenwave: {
    url: string;
  };
  waiverdb: {
    url: string;
  };
  datagrepper: {
    url: string;
  };
  sst: {
    url: string;
    results: string;
  };
  opensearch: {
    client: ClientOptions;
    indexes_prefix: string;
    size: number;
  };
  koji_fp: {
    host: string;
    port: number;
    path: string;
    headers: {
      useragent: string;
    };
  };
  koji_cs: {
    host: string;
    port: number;
    path: string;
    headers: {
      useragent: string;
    };
  };
  koji_brew: {
    host: string;
    port: number;
    path: string;
    headers: {
      useragent: string;
    };
  };
  mbs: Partial<Record<MbsInstance, MbsInstanceConfig>>;
  distgit: {
    cs: {
      base_url: string;
      base_url_api: string;
    };
    fp: {
      base_url: string;
      base_url_api: string;
    };
    rh: {
      base_url: string;
    };
  };
  krb: {
    keytab: string;
    principal: string;
  };
  metadata: {
    rw_groups: { set: string[] };
  };
  teiid: {
    client_config: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      ssl: boolean;
    };
  };
}

const cfg = getcfg();

/**
 * These are default search-field for each artifact type
 *
 * List here all possible artifact-types:
 *
 * https://github.com/fedora-ci/kaijs/blob/main/src/dbInterface.ts#L24
 * https://pagure.io/greenwave/blob/master/f/conf/subject_types
 * https://gitlab.cee.redhat.com/gating/greenwave-playbooks/-/blob/master/roles/greenwave/files/subject_types.yaml
 *
 */
export const known_types = {
  'brew-build': 'payload.nvr',
  'koji-build': 'payload.nvr',
  'koji-build-cs': 'payload.nvr',
  'redhat-module': 'payload.nsvc',
  // XXX: ???
  'copr-build': 'component',
  // XXX: ???
  'productmd-compose': 'payload.compose_id',
  'redhat-container-image': 'payload.nvr',
};

export type TKnownType = keyof typeof known_types;

let greenwave_cfg_ = undefined;
if (cfg.greenwave?.url) {
  greenwave_cfg_ = {
    url: cfg.greenwave.url,
    about: {
      api_url: new URL('/api/v1.0/about', cfg.greenwave.url),
    },
    policies: {
      api_url: new URL('/api/v1.0/policies', cfg.greenwave.url),
    },
    subject_types: {
      api_url: new URL('/api/v1.0/subject_types', cfg.greenwave.url),
    },
    decision: {
      api_url: new URL('/api/v1.0/decision', cfg.greenwave.url),
      context: {
        'brew-build': 'osci_compose_gate',
        'redhat-module': 'osci_compose_gate_modules',
        'redhat-container': 'cvp_default',
      },
      product_version: {
        'brew-build': 'rhel-8',
        'redhat-module': 'rhel-8',
        'redhat-container': 'cvp',
      },
    },
  };
}
export const greenwave_cfg = greenwave_cfg_;

let waiverdb_cfg_ = undefined;
if (cfg.waiverdb?.url) {
  waiverdb_cfg_ = {
    url: cfg.waiverdb?.url,
    waivers: {
      api_url: new URL('/api/v1.0/waivers/', cfg.waiverdb.url),
    },
    about: {
      api_url: new URL('/api/v1.0/about', cfg.waiverdb.url),
    },
    permissions: {
      api_url: new URL('/api/v1.0/permissions', cfg.waiverdb.url),
    },
  };
}
export const waiverdb_cfg = waiverdb_cfg_;
