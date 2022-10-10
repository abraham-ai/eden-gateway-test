import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()
const GATEWAY_URL = process.env.GATEWAY_URL;
const MINIO_URL = process.env.MINIO_URL;
const MINIO_BUCKET = process.env.MINIO_BUCKET;
const USER_ADDRESS = process.env.USER_ADDRESS;
const USER_MESSAGE = process.env.USER_MESSAGE;
const USER_SIGNATURE = process.env.USER_SIGNATURE;


async function getAuthToken(data) {
  let response = await axios.post(GATEWAY_URL+'/sign_in', data)
  var authToken = response.data.authToken;
  return authToken;
}


async function startPrediction(data) {
  let response = await axios.post(GATEWAY_URL+'/request', data)
  return response;
}


async function main() {

  // get auth token
  let authData = {
    "userType": "ethereum", 
    "userId": USER_ADDRESS,
    "message": USER_MESSAGE,
    "signature": USER_SIGNATURE
  };
  
  let authToken = await getAuthToken(authData);
  console.log(`auth token: ${authToken}`);

  // send request to eden
  let config = {
    "mode": "generate", 
    "text_input": "The quick brown fox jumps over the lazy dog.",
    "sampler": "euler_ancestral",
    "scale": 10.0,
    "steps": 50, 
    "W": 512,
    "H": 512,
    "seed": Math.floor(1e8 * Math.random())
  }

  const request = {
    "token": authToken,
    "application": "heartbeat", 
    "generator_name": "stable-diffusion", 
    "config": config
  }

  let response = await startPrediction(request);
  let prediction_id = response.data;
  console.log(`job submitted, task id ${prediction_id}`);

  // poll every few seconds for update to the job
  setInterval(async function() {
    let response = await axios.post(GATEWAY_URL+'/fetch', {
      "taskIds": [prediction_id]
    });
    let {status, output} = response.data[0];
    if (status == 'complete') {
      let imgUrl = `${MINIO_URL}/${MINIO_BUCKET}/${output}`;
      console.log(`finished! image at ${imgUrl}`);
      clearInterval(this);
    }
    else if (status == 'failed') {
      console.log("failed");
      clearInterval(this);
    }
  }, 2000);

}


main()
