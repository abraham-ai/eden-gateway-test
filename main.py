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

# access_security = JwtAccessBearerCookie(
#     secret_key="secret_key",
#     auto_error=True,
#     access_expires_delta=timedelta(hours=1),  # custom access token valid timedelta
#     refresh_expires_delta=timedelta(days=1),  # custom access token valid timedelta
# )


class AuthData(BaseModel):
    user_id: str
    user_type: str


# curl -d '{"user_id": "404322488215142410", "user_type": "discord"}' -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/auth

@app.post("/auth")
def auth(auth_data: AuthData):
    user = {"user_type": auth_data.user_type, "user_id": auth_data.user_id}
    access_token = access_security.create_access_token(subject=user)
    return {"access_token": access_token}

# curl -d '{"user_id": "404322488215142410", "user_type": "discord"}' -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/auth


#curl -d '{"user_id": "404322488215142410", "user_type": "discord"}' -H 'Content-Type: application/json' -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWJqZWN0Ijp7InVzZXJfdHlwZSI6ImRpc2NvcmQiLCJ1c2VyX2lkIjoiNDA0MzIyNDg4MjE1MTQyNDEwIn0sInR5cGUiOiJhY2Nlc3MiLCJleHAiOjE2NjMyNTU2MDcsImlhdCI6MTY2MzI1NDcwNywianRpIjoiOGZhOGRmMzItYWZlZS00YjYwLTg5MzItMDJmOTFhYWNlYTM4In0.SEwS00vyXM9A9yRFugecB6JuVJmrKLMYd5_BMgtM-ms" https://app.dev.aws.abraham.fun/users/me


@app.post("/users/me")
def read_current_user(
    credentials: JwtAuthorizationCredentials = Security(access_security),
):
    print("GOT IT!", credentials)
    return "yay"



#curl -d '{"generator_name": "stable-diffusion", "config": {"text_input": "an apple falls from the tree", "scale": 2.0}, "source": {"origin": "dicscord", "id": 79182}}' -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/request


#curl -d '{"generator_name": "stable-diffusion", "config": {"text_input": "an apple falls from the tree", "scale": 2.0}}' -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWJqZWN0Ijp7InVzZXJfdHlwZSI6ImRpc2NvcmQiLCJ1c2VyX2lkIjoiNDA0MzIyNDg4MjE1MTQyNDEwIn0sInR5cGUiOiJhY2Nlc3MiLCJleHAiOjE2NjMyNTU2MDcsImlhdCI6MTY2MzI1NDcwNywianRpIjoiOGZhOGRmMzItYWZlZS00YjYwLTg5MzItMDJmOTFhYWNlYTM4In0.SEwS00vyXM9A9yRFugecB6JuVJmrKLMYd5_BMgtM-ms" -H 'Content-Type: application/json' https://app.dev.aws.abraham.fun/request





def get_cost(user, generator_name, config):
    cost = 0
    if generator_name == 'stable-diffusion':
        if config['mode'] == 'generate':
            cost = 1
        elif config['mode'] == 'interpolate':
            cost = config['n_interpolate'] * len(config['interpolate_texts'])
    elif generator_name == 'clipx':
        cost = 1
    print("COST IS!")
    return cost


def get_permission(user, cost):
    user_db = db.credits.find_one(user)
    balance = user_db['balance']
    rate_limit_hit = False
    if rate_limit_hit:
        return False, 'Rate limit hit, please try again later'
    elif cost > balance:
        return False, 'Not enough credits remaining'
    else:
        return True, 'Success'
    
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
    credentials: JwtAuthorizationCredentials = Security(access_security)
):
    user = {
        'user_type': credentials["user_type"], 
        'user_id': credentials["user_id"]
    }

    cost = get_cost(user, request.generator_name, request.config)

    print("cost is")
    print(cost)

    permission, reason = get_permission(user, cost)   

    print("done", permission, reason) 

    if not permission:
        raise HTTPException(status_code=403, detail=str(reason))

    print(permission)


    #cost = get_cost(user, generator_name, config)
    #permission, reason = get_permission(user, cost)
    #if not permission:
    #    return {status: error, message: reason}

    generator = generators[request.generator_name]
    config = load_json(generator.config)

    print("CONFIG 1")
    print(config)

    try:
        config = overwrite_dict(config, request.config)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    print("CONFIG 2")
    print(config)



    #config = overwrite_fields(config, config_)


    model = replicate.models.get(generator.cog)
    version = model.versions.list()[0]
    webhook_url = f"{server_url}/model_update"

    prediction = replicate.predictions.create(
        version = version,
        input = config,
        webhook_completed = webhook_url
    )

    result = db.requests.insert_one({
        'timestamp': datetime.datetime.utcnow(),
        'generator': generator,
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
