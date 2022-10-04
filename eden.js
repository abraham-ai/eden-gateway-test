import axios from 'axios'

import * as utils from './utils.js'
import {db, minio} from "./db.js"
import {SERVER_URL, MINIO_BUCKET} from "./constants.js"


export async function submit(generator, config) {
  //const webhookUrl = `${SERVER_URL}/model_update_eden`;
  const prediction = await axios.post(`${generator.edenUrl}/run`, config);
  const task_id = prediction.data.token;

  const generator_data = {
    service: "eden",
    name: generator.cog,
    version: null,  // todo
    task_id: task_id,
  }

  const task = {
    status: "pending",
    id: task_id
  }
  
  return {task, generator_data};
}


export async function receiveGeneratorUpdate(req, res) {
  const {id, status, completed_at, creation} = req.body;
  
  // get the original request
  const request = await db.collection('requests').findOne({"generator.task_id": id});
  if (!request) {
    return res.status(500).send(`Request ${id} not found`);
  }
  
  // verify sender (todo)

  // check status
  if (status == "failed") {
    await db.collection('requests').updateOne({_id: request._id}, {
      $set: {status: "failed", error: req.body.error}
      
      // refund them
    });
  }
  else {
    if (creation.data) {
      const fileType = "jpeg";
      const base64image = Buffer.from(creation.data, "base64");
      const sha = utils.sha256(base64image);
      const metadata = {'Content-Type': `image/${fileType}`, 'SHA': sha};
      let update = {output: sha};
      if (completed_at) {
        update.status = 'complete';
      } else {
        update.status = 'running';
        update.progress = 50; // todo
      }
      await minio.putObject(MINIO_BUCKET, sha, base64image, metadata);
      await db.collection('requests').updateOne({_id: request._id}, {$set: update});
    }
  }

  res.status(200).send("Success");
}
