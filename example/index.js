import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const GATEWAY_URL = process.env.GATEWAY_URL;
const MINIO_URL = process.env.MINIO_URL;
const MINIO_BUCKET = process.env.MINIO_BUCKET;

// two ways to authenticate:

// 1) API Key
const API_KEY  = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// 2) Ethereum signature
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

  // Ethereum version
  /*
  let authData = {
    "userType": "ethereum", 
    "userId": USER_ADDRESS,
    "message": USER_MESSAGE,
    "signature": USER_SIGNATURE
  };
  */

  // API Key version
  let authData = {
    "apiKey": API_KEY, 
    "apiSecret": API_SECRET
  };

  let authToken = await getAuthToken(authData);
  console.log(`auth token: ${authToken}`);

  // send request to eden
  let img_config = {
    "mode": "generate", 
    "text_input": "The quick brown fox jumps over the lazy dog.",
    "sampler": "euler_ancestral",
    "scale": 10.0,
    "steps": 50, 
    "width": 512,
    "height": 512,
    "seed": Math.floor(1e8 * Math.random())
  }


  let real2real_config = {
    "mode": "interpolate", 
    "stream": true,
    "stream_every": 1,
    "text_input": "real2real", // text_input has no effect in interpolate mode
    "seed": Math.floor(1e8 * Math.random()), // seed has no effect in interpolate mode
    "sampler": "euler",
    "scale": 10.0,
    "steps": 50, 
    "width": 512,  // will target width * height pixels, but aspect ratio will be set automatically to average of interpolation_init_images
    "height": 512,
    "interpolation_init_images": [
      "https://cdn.discordapp.com/attachments/1006144058940469268/1035386954994434078/taj.jpg",
      "https://cdn.discordapp.com/attachments/1006144058940469268/1035386954751156224/trees.jpg"
    ],
    "interpolation_seeds": [
      Math.floor(1e8 * Math.random()),
      Math.floor(1e8 * Math.random())
    ],
    "interpolation_init_images_use_img2txt": true, // use prompt-search to get text inputs. if false, need to set "interpolation_texts" manually
    "n_frames": 90,  // total number of frames
    "loop": true,
    "smooth": true,
    "n_film": 1
  }

  const request = {
    "token": authToken,
    "application": "heartbeat", 
    "generator_name": "stable-diffusion", 
    "config": real2real_config,
    "metadata": {"hello": "world"}  // optional metadata can be retrieved later
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
      let outputUrl = `${MINIO_URL}/${MINIO_BUCKET}/${output}`;
      console.log(`finished! result at ${outputUrl}`);
      clearInterval(this);
    }
    else if (status == 'failed') {
      console.log("failed");
      clearInterval(this);
    }
  }, 2000);

}


main()
