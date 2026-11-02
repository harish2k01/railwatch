import {appendFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

/** Uses only the ephemeral Actions service and exports its verified connection for later steps. */
async function prepareDatabase(){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_ENV)throw new Error('Run only inside a GitHub Actions job.');
  const port=Number(process.env.CI_POSTGRES_PORT);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('The CI PostgreSQL service did not publish a valid port.');
  const connectionString=`postgresql://postgres:local-ci-only@127.0.0.1:${port}/railwatch_ci_test`;
  for(let attempt=1;attempt<=15;attempt++){
    const client=new pg.Client({connectionString,connectionTimeoutMillis:2000,query_timeout:2000});
    try{
      await client.connect();await client.query('SELECT 1');
      appendFileSync(process.env.GITHUB_ENV,`DATABASE_URL=${connectionString}\n`);
      console.log(`CI PostgreSQL is query-ready on assigned port ${port}.`);return;
    }catch{console.log(`Waiting for CI PostgreSQL (${attempt}/15).`);}
    finally{await client.end().catch(()=>{});}
    if(attempt<15)await delay(1000);
  }
  throw new Error('CI PostgreSQL did not become query-ready; migrations were not started.');
}
await prepareDatabase();
