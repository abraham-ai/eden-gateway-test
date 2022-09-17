import fs from 'fs';

export function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function getAllPropertiesValid(obj_canonical, obj) {
  return Object.keys(obj).every(e => Object.keys(obj_canonical).includes(e));
}

export function writeFile(path, text) {
  console.log("lets")
  console.log(text)
  let text2 = JSON.stringify(text);
  console.log(path)
  fs.writeFile(path, text2, function(err) {
    if(err) {
      console.log("NO!!!!")
      return console.log(err);
    }
  });
}; 

// Or
fs.writeFileSync('/tmp/test-sync', 'Hey there!');
