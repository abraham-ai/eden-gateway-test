import asyncio
import random
import requests
import os
import dotenv

dotenv.load_dotenv()

GATEWAY_URL = "https://gateway-test.abraham.ai"
MINIO_URL = "https://minio.aws.abraham.fun"
MINIO_BUCKET = "creations-stg"

# two ways to authenticate:

# 1) API Key
API_KEY = os.getenv('API_KEY')
API_SECRET = os.getenv('API_SECRET')

# 2) Ethereum signature
USER_ADDRESS = os.getenv('USER_ADDRESS')
USER_MESSAGE = os.getenv('USER_MESSAGE')
USER_SIGNATURE = os.getenv('USER_SIGNATURE')


def get_auth_token(data):
    response = requests.post(GATEWAY_URL + '/sign_in', json=data)
    auth_token = response.json()['authToken']
    return auth_token


def start_prediction(data):
    response = requests.post(GATEWAY_URL + '/request', json=data)
    return response


async def main():

    # get auth token

    # Ethereum version
    """
    auth_data = {
        "userType": "ethereum",
        "userId": USER_ADDRESS,
        "message": USER_MESSAGE,
        "signature": USER_SIGNATURE
    }
    """

    # API Key version
    auth_data = {
        "apiKey": API_KEY,
        "apiSecret": API_SECRET
    }

    auth_token = get_auth_token(auth_data)
    print(f'auth token: {auth_token}')

    # send request to eden
    img_config = {
        "mode": "generate",
        "text_input": "The quick brown fox jumps over the lazy dog.",
        "sampler": "euler_ancestral",
        "scale": 10.0,
        "steps": 50,
        "width": 512,
        "height": 512,
        "seed": int(1e8 * random.random())
    }

    real2real_config = {
        "mode": "interpolate",
        "stream": True,
        "stream_every": 1,
        "text_input": "real2real", # text_input has no effect in interpolate mode
        "seed": int(1e8 * random.random()), # seed has no effect in interpolate mode
        "sampler": "euler",
        "scale": 10.0,
        "steps": 50,
        "width": 512, # will target width * height pixels, but aspect ratio will be set automatically to average of interpolation_init_images
        "height": 512,
        "interpolation_init_images": [
            "https://cdn.discordapp.com/attachments/1006144058940469268/1035386954994434078/taj.jpg",
            "https://cdn.discordapp.com/attachments/1006144058940469268/1035386954751156224/trees.jpg"
        ],
        "interpolation_seeds": [
            int(1e8 * random.random()),
            int(1e8 * random.random())
        ],
        "interpolation_init_images_use_img2txt": True, # use prompt-search to get text inputs. if false, need to set "interpolation_texts" manually
        "n_frames": 12,  # total number of frames
        "loop": True,
        "smooth": True,
        "n_film": 0
    }

    request = {
        "token": auth_token,
        "application": "heartbeat", 
        "generator_name": "stable-diffusion", 
        "config": real2real_config,
        "metadata": {"hello": "world"}  # optional metadata can be retrieved later
    }

    response = start_prediction(request)

    prediction_id = response.content.decode('utf-8')
    print(f'job submitted, task id {prediction_id}');


    # run the following code every 2 seconds
    while True:
        response = requests.post(GATEWAY_URL + '/fetch', json={
            "taskIds": [prediction_id]
        })
        result = response.json()
        for res in result:
            status = res['status']
            if status == 'complete':
                output = res['output']
                output_url = f'{MINIO_URL}/{MINIO_BUCKET}/{output}'
                print(f'finished! result at {output_url}')
                return
            elif status == 'failed':
                print('failed')
                return
        await asyncio.sleep(2)


if __name__ == '__main__':
    asyncio.run(main())