import Replicate from 'replicate-js'

import axios from 'axios'
import {serverUrl, minio_url, minio_bucket, minio_access_key, minio_secret_key} from './constants.js'
import {REPLICATE_API_TOKEN} from "./constants.js"
import {randomUUID} from './utils.js'


const replicate = new Replicate({
  token: REPLICATE_API_TOKEN
});

export async function submit(generator, config) {
  const replicateConfig = config; //formatConfigForReplicate(instanceConfig);

  const webhookSecret = randomUUID();
  const webhookUrl = `${serverUrl}/model_update?secret=${webhookSecret}`;
  
  const model = await replicate.getModel(generator.cog);
  const modelVersion = model.results[0].id;

  const task = await replicate.startPrediction(
    modelVersion, 
    replicateConfig,
    webhookUrl
  );

  const generator_data = {
    service: "replicate",
    name: generator.cog,
    version: modelVersion,
    task_id: task.id,
    secret: webhookSecret
  }
  
  return {task, generator_data};
}

export async function download(url) {
  const obj = await axios.get(url, {  
    headers: {
      'Authorization': "Token "+REPLICATE_API_TOKEN,
      'Content-Type': "application/json",
      'Accept': "application/json",      
    },
    responseType: 'arraybuffer',
  });
  return obj;
}

function formatConfigForReplicate(config) {
  config['translation_x'] = config['translation'][0];
  config['translation_y'] = config['translation'][1];
  config['translation_z'] = config['translation'][2];
  config['rotation_x'] = config['rotation'][0];
  config['rotation_y'] = config['rotation'][1];
  config['rotation_z'] = config['rotation'][2];
  config['interpolation_texts'] = config['interpolation_texts'].join("|")
  config['interpolation_seeds'] = config['interpolation_seeds'].join("|")
  delete config['translation'];
  delete config['rotation'];
  return config;
}
