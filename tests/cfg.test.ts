import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import jsyaml from 'js-yaml';

import { mk_config_from_env, old_mk_config_from_env } from '../src/cfg';

test('new function replicates old one', () => {
  const configFileName = path.join(
    __dirname,
    '../assets',
    'config-default.yaml',
  );
  const configFileContents = fs.readFileSync(configFileName, 'utf-8');
  const rawConfigObject = jsyaml.load(configFileContents);
  const envToConfigMap = _.get(rawConfigObject, 'env_to_config_map');
  const configOld = old_mk_config_from_env(envToConfigMap);
  const configNew = mk_config_from_env(envToConfigMap!);
  expect(configNew).toEqual(configOld);
});
