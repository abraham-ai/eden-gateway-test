import datetime
from pydantic import BaseModel
from fastapi import (
    Request, 
    FastAPI, 
    Security, 
    HTTPException
)
from fastapi_jwt import JwtAuthorizationCredentials, JwtAccessBearer
from pymongo import MongoClient
import replicate

from secrets import *
from utils import *

'''

db (requests + creations + credits)
publish from callback
----
jwt/verifyUser




db.requests.add(
    timestamp,
    predict_id,
    generator_name, 
    config
)


'''


client = MongoClient(mongo_url)
db = client[db_name]


app = FastAPI()

access_security = JwtAccessBearer(secret_key="secret_key", auto_error=True)

# access_security = JwtAccessBearerCookie(
#     secret_key="secret_key",
#     auto_error=True,
#     access_expires_delta=timedelta(hours=1),  # custom access token valid timedelta
#     refresh_expires_delta=timedelta(days=1),  # custom access token valid timedelta
# )


class AuthData(BaseModel):
    user_id: str
    user_type: str



@app.post("/sign_in")
def sign_in(auth_data: AuthData):
    user = {"user_type": auth_data.user_type, "user_id": auth_data.user_id}
    access_token = access_security.create_access_token(subject=user)
    return {"access_token": access_token}




@app.post("/users/me")
def read_current_user(
    credentials: JwtAuthorizationCredentials = Security(access_security),
):
    print("GOT IT!", credentials)
    return "yay"






def get_cost(user, generator_name, config):
    cost = 0
    if generator_name == 'stable-diffusion':
        if config['mode'] == 'generate':
            cost = 1
        elif config['mode'] == 'interpolate':
            cost = config['n_interpolate'] * len(config['interpolate_texts'])
    elif generator_name == 'clipx':
        cost = 1
    return cost



#user={"user_id": "4043224882151424120", "user_type": "discord"}
#user_db = db.credits.find_one(user)

def get_permission(user, cost):
    user_db = db.credits.find_one(user)
    if not user_db:
        return False, 'User not found'
    balance = user_db['balance']
    rate_limit_hit = False
    if rate_limit_hit:
        return False, 'Rate limit hit, please try again later'
    elif cost > balance:
        return False, 'Not enough credits remaining'
    else:
        return True, 'Success'
    
def spend_credits(user, cost):
    user_db = db.credits.find_one(user)
    print(user, user_db['balance'])
    if not user_db:
        raise ValueError("User not found")
    if user_db['balance'] < cost:
        raise ValueError("User doesn't have enough credits")
    db.credits.update_one(user, {"$set": {'balance': user_db['balance'] - cost}}, upsert=False)


class RequestData(BaseModel):
    generator_name: str
    config: dict = {}
    source: dict = {}






# request_creation
# - config_: json 
# - generator_name: str
# - header
# - auth: str
# - user
#     - source: str [discord, eth] 
#     - id: str [discord_id, wallet]
# - callback=None

@app.post("/request")
def request(
    request: RequestData,
    #credentials: JwtAuthorizationCredentials = Security(access_security)
):

    # user = {
    #     'user_type': credentials["user_type"], 
    #     'user_id': credentials["user_id"]
    # }

    user = {"user_id": "404322488215142410", "user_type": "discord"}

    cost = get_cost(user, request.generator_name, request.config)
    permission, reason = get_permission(user, cost)   
    if not permission:
        raise HTTPException(status_code=403, detail=str(reason))

    if request.generator_name not in generators:
        raise HTTPException(status_code=400, detail=f"Generator {generator_name} not recognized")

    generator = generators[request.generator_name]
    config = load_json(generator.config)

    try:
        config = overwrite_dict(config, request.config)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    model = replicate.models.get(generator.cog)
    version = model.versions.list()[0]
    webhook_url = f"{server_url}/model_update"

    prediction = replicate.predictions.create(
        version = version,
        input = config,
        webhook_completed = webhook_url
    )

    if prediction.status == 'failed':
        raise HTTPException(status_code=500, detail="Request to generator failed")
        
    elif prediction.status in ['starting', 'processing', 'succeeded']:
        spend_credits(user, cost)

        db.requests.insert_one({
            'timestamp': datetime.datetime.utcnow(),
            'generator': generator,
            'config': config,
            'cost': cost,
            'replicate_id': prediction.id
        })

    result = {"status": prediction.status, 'replicate_id': prediction.id}
    return result




results = load_json('result2.txt')
print(results['status'])


results['output']




@app.post("/model_update")
async def model_update(request: Request):
    results = await request.json()


    # _id, date, eth address/api_key, source, 
    # _id, timestamp, generator (cog, config.json), config, cost, replicate_id
    # ==> status + progress, sha + video_sha
    # save to minio
    # verify callback is from authorized origin?

    # if result.status == complete:
    #     creation = db.creations.add(

    #     )
    #     db.requests.set(
    #         predict_id,
    #         'result': creation.id
    #     )
    # if result.status == fail:
    #     db.requests.set(
    #         predict_id,
    #         'fail'
    #     )
    #     - reimburse credit

    request = db.requests.find_one({'replicate_id': results['id']})
    
    if results['status'] == 'failed':
        print('reimburse credits')
        
        
    elif results['status'] == 'completed':
        print("COMPELTED!!")
        

    #error, logs
    with open("result.txt", "w") as file:
        result_str = 'NEW\n\n%s\n%s\n%s' %(
            results['id'], results['version'], results['status']
        )
        file.write(result_str)
    with open("result2.txt", "w") as file:
        r = json.dumps(results)
        file.write(r)


# @app.post("/items/{item_id}")
# def read_item(item_id: int):
#     with open("result.txt", "a") as file:
#         file.write(f'We got item {item_id}')

