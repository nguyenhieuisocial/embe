import sqlite3
import sys

connection = sqlite3.connect(sys.argv[1])
connection.execute("create table sample(id integer primary key, value text)")
connection.execute("insert into sample(value) values ('ok')")
connection.commit()
connection.close()
