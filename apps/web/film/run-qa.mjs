// Run local Remotion QA with progress logs, so long render jobs can be inspected independently.
import {mkdir,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), [job,...args]=process.argv.slice(2);
if(!/^[a-z-]+$/.test(job??''))throw Error('Expected a QA job name');
await mkdir('film/qa',{recursive:true});
const log=await open(`film/qa/${job}.log`,'w');
const cli=require.resolve('@remotion/cli/package.json').replace(/package\.json$/,'remotion-cli.js');
const child=spawn(process.execPath,[cli,...args],{stdio:['ignore',log.fd,log.fd],windowsHide:true});
child.on('close',async code=>{await log.write(`\nExit: ${code}\n`);await log.close();process.exitCode=code??1;});
