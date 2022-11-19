import {ObjectId} from 'mongodb';
import {db} from "./db.js"


export async function handleGetCollectionsRequest(req, res) {
  try {
    const {collectionIds, userIds} = req.body;
    const filter = {};
    if (collectionIds) {
      filter["_id"] = {$in: collectionIds.map((id) => ObjectId(id))}; 
    }
    if (userIds) {
      const userIds_ = await db.collection('collections').find({"userId": {$in: userIds.map((id) => ObjectId(id))}}).toArray().map((user) => user._id);
      filter["user"] = {$in: userIds_};
    }
    const collections = await db.collection('collections').find(filter).toArray();
    return res.status(200).send(collections);
  } 
  catch (error) {
    return res.status(500).send(error.message);
  }
}


export async function handleCreateCollectionRequest(req, res) {
  const {name} = req.body;
  const userCredentials = auth.identifyUser(req);
  const user = await db.collection('users').findOne(userCredentials);
  const newCollection = {user: user._id, name: name, requests: []};
  await db.collection('collections').insertOne(newCollection);
  return res.status(200).send("Collection created");
}


export async function handleEditCollectionRequest(req, res) {
  const {creation, collection, action} = req.body;
  const userCredentials = auth.identifyUser(req);
  const user = await db.collection('users').findOne(userCredentials);
  const creation_ = await db.collection('requests').findOne({_id: ObjectId(creation)});
  const collection_ = await db.collection('collections').findOne({_id: ObjectId(collection)});

  if (!creation_) {
    return res.status(401).send("Creation not found");
  }
  if (!collection_) {
    return res.status(401).send("Collection not found");
  }
  if (!collection_.user.equals(user._id)) {
    return res.status(401).send("User does not own collection");
  }
  if (action != "add" && action != "remove") {
    return res.status(401).send("Action must be either add or remove");
  }

  let update = {};
  if (action == "add") {
    update["$addToSet"] = {requests: creation_._id};
  } 
  else if (action == "remove") {
    update["$pull"] = {requests: creation_._id};
  }

  await db.collection('collections').updateOne({_id: ObjectId(collection)}, update);
  return res.status(200).send("Collection updated");
}