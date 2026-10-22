import { readFile,writeFile } from "node:fs/promises";
const manifest=JSON.parse(await readFile("package.json","utf8"));
for(const group of ["dependencies","devDependencies"])for(const name of Object.keys(manifest[group] || {})){
  const installed=JSON.parse(await readFile("node_modules/"+name+"/package.json","utf8"));
  manifest[group][name]=installed.version;
}
const lock=JSON.parse(await readFile("package-lock.json","utf8"));
lock.packages[""].dependencies=manifest.dependencies;
lock.packages[""].devDependencies=manifest.devDependencies;
await writeFile("package.json",JSON.stringify(manifest,null,2)+"\n");
await writeFile("package-lock.json",JSON.stringify(lock,null,2)+"\n");
console.log("Pinned installed dependencies and lockfile.");
