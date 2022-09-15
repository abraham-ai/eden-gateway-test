
import json


def load_json(json_path):
    with open(json_path, 'r') as file:
        data = json.load(file)
    return data


def overwrite_dict(data, data_new):
    for k, v in data_new.items():
        if k not in data:
            print("NO!")
            raise ValueError(f'Custom field {k} not in config')
        data[k] = v
    return data


