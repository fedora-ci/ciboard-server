import _ from 'lodash';
import fs from 'fs';
import jsyaml from 'js-yaml';
import path from 'path';

import { mk_config_from_env } from '../src/cfg';

test('parsing config from environment produces plain object', () => {
  const configFileName = path.join(
    __dirname,
    '../assets',
    'config-default.yaml',
  );
  const configFileContents = fs.readFileSync(configFileName, 'utf-8');
  const rawConfigObject = jsyaml.load(configFileContents);
  const envToConfigMap = _.get(rawConfigObject, 'env_to_config_map');
  const parsedConfig = mk_config_from_env(envToConfigMap!);
  expect(_.isPlainObject(parsedConfig)).toBeTruthy();
});
