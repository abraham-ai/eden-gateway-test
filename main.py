from typing import Union

from fastapi import FastAPI, Security
from fastapi_jwt import JwtAuthorizationCredentials, JwtAccessBearer

import replicate



'''
callback
 - predict_id
 - result

verify callback is from authorized origin?

if result.status == complete:
    creation = db.creations.add(

    )
    db.requests.set(
        predict_id,
        'result': creation.id
    )
if result.status == fail:
    db.requests.set(
        predict_id,
        'fail'
    )
    - reimburse credit

request_creation
 - config_: json 
 - generator_name: str
 - header
   - auth: str
   - user
     - source: str [discord, eth] 
     - id: str [discord_id, wallet]
 - callback=None

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

'''

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


@app.get("/")
def read_root():

    model = replicate.models.get("genekogan/stable-diffusion-cog")
    #prediction = model.predict(input_text="a rabbit doing a dance at a nightclub, by Norman Rockwell in the year 2069")

    prediction = replicate.predictions.create(
        version = model.versions.list()[0],
        input = {
            "text_input" : "a rabbit doing a dance at a nightclub, by Norman Rockwell in the year 2069"
        }
        webhook_completed = "https://example.com/webhook"
    )

    

    return {"Hello": prediction.status}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}
