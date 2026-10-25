export function adapter(sqlite) {
 return {prepare(sql){let args=[];const stmt=sqlite.prepare(sql);return {bind(...a){args=a;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return stmt.run(...args)}}},async batch(statements){sqlite.exec('BEGIN');try {const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
}
