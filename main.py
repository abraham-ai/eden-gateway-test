import datetime
from fastapi import Request, FastAPI, Security
from fastapi_jwt import JwtAuthorizationCredentials, JwtAccessBearer
from pydantic import BaseModel
from pymongo import MongoClient
import replicate

from secrets import *


'''

db (requests + creations + credits)
publish from callback
----
jwt/verifyUser



is_auth = verify(auth)

if not is_auth:
    return {status: error, message: 403}

cost = get_cost(user, generator_name, config)

permission, reason = get_permission(user, cost)
 -  user_balance = get_balance(user)
    rate_limit_hit = False  # Todo
    if not rate_limit_hit:        
        return False, RATE_LIMIT_HIT
    elif user_balance >= cost:
        return False, OUT_OF_CREDIT
    else:
        subtract credit
        return True, SUCCESS

if not permission:
    return {status: error, message: reason}

generator, config = get_generator(generator_name)

config = overwrite_fields(config, config_)

predict_id = generator.predict(config, callback)

db.requests.add(
    timestamp,
    predict_id,
    generator_name, 
    config
)


#curl -d '{"name": "gene", "description": "yo", "price": 56.3, "tax": 0.5}' -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/test2

'''


client = MongoClient(mongo_url)
db = client[db_name]


app = FastAPI()
access_security = JwtAccessBearer(secret_key="secret_key", auto_error=True)

@app.post("/auth")
def auth():
    subject = {"username": "username", "role": "user"}
    return {"access_token": access_security.create_access_token(subject=subject)}


@app.get("/users/me")
def read_current_user(
    credentials: JwtAuthorizationCredentials = Security(access_security),
):
    return {"username": credentials["username"], "role": credentials["role"]}



#curl -d '{"generator_name": "stable-diffusion", "config": {"text_input": "an apple falls from the tree", "scale": 2.0}, "source": {"origin": "dicscord", "id": 79182}}' -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/request




class RequestData(BaseModel):
    generator_name: str
    config: dict = {}
    source: dict = {}


@app.post("/request")
def request(
    request: RequestData
):

    # request_creation
    # - config_: json 
    # - generator_name: str
    # - header
    # - auth: str
    # - user
    #     - source: str [discord, eth] 
    #     - id: str [discord_id, wallet]
    # - callback=None


    #is_auth = verify(auth)
    #if not is_auth:
    #    return {status: error, message: 403}

    #cost = get_cost(user, generator_name, config)
    #permission, reason = get_permission(user, cost)
    #if not permission:
    #    return {status: error, message: reason}

    generator = generators[request.generator_name]
    cog_name, config = generator['cog'], generator['default_config']

    #config = overwrite_fields(config, config_)

    model = replicate.models.get(cog_name)
    version = model.versions.list()[0]
    webhook_url = f"{server_url}/model_update"

    prediction = replicate.predictions.create(
        version = version,
        input = config,
        webhook_completed = webhook_url
    )

    result = db.requests.insert_one({
        'timestamp': datetime.datetime.utcnow(),
        'cog_name': cog_name,
        'config': config,
        'replicate_id': prediction.id
    })

    return {"Hello": prediction.status, 'id': prediction.id}



@app.post("/model_update")
async def model_update(request: Request):
    results = await request.json()

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

    result_str = '%s %s %s' %(results['id'], results['version'], results['status'])
    #error, logs
    with open("result.txt", "w") as file:
        file.write(result_str)


# @app.post("/items/{item_id}")
# def read_item(item_id: int):
#     with open("result.txt", "a") as file:
#         file.write(f'We got item {item_id}')


def get_balance(user):
    return 5

def get_permission(user, cost):
    user_balance = get_balance(user)
    rate_limit_hit = False  # Todo
    if not rate_limit_hit:        
        return False, 'Rate limit reached'
    elif user_balance >= cost:
        return False, 'Out of credit'
    else:
        #subtract credit
        return True, 'Success'