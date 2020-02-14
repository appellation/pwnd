#[macro_use]
extern crate clap;

#[macro_use]
extern crate arrayref;

use clap::App;
use pwd_core::{local::SqliteStore, secret::{KeyPair, Secret, SecretStore, StaticSecret}, util};
use std::fs;

fn main() {
	let yml = load_yaml!("cli.yml");
	let matches = App::from_yaml(yml).get_matches();

	let kp = match fs::read("pwd.pk") {
		Ok(bytes) => {
			if bytes.len() != 32 {
				panic!("Invalid private key file");
			}

			let pk = array_ref![bytes, 0, 32];
			StaticSecret::from(pk.to_owned())
		},
		Err(_) => {
			let new_key = StaticSecret::generate();
			fs::write("pwd.pk", new_key.private_key()).expect("Error creating private key file!");
			new_key
		}
	};

	let secret_store = SqliteStore::new("pwd.sqlite3", kp);

	match matches.subcommand() {
		("list", Some(_)) => {
			let secrets = secret_store.list().unwrap();
			for secret in secrets {
				println!("{}", secret.name);
			}
		},
		("add", Some(args)) => {
			let name = args.value_of("name").expect("Name is required!").to_string();
			let value = args.value_of("value").expect("Value is required!").to_string();
			let secret = Secret{
				id: 0,
				name,
				value: Some(value.into_bytes()),
			};

			secret_store.add(&secret).unwrap();
		},
		("get", Some(args)) => {
			let name = args.value_of("name").expect("Name is required!");
			let secret = secret_store.get(name).unwrap();
			match secret {
				Some(s) => println!("{}", String::from_utf8_lossy(&s.value.unwrap().to_vec())),
				None => println!("Nothing found that matches {}", name),
			};
		},
		("generate", Some(args)) => {
			let len: usize = match args.value_of("length") {
				Some(val) => match val.parse() {
					Ok(v) => v,
					Err(_) => panic!("Non-number provided for length!"),
				},
				None => 24,
			};

			let pwd = util::random_string(len);

			if let Some(name) = args.value_of("name") {
				secret_store.add(&Secret{
					id: 0,
					name: name.to_string(),
					value: Some(pwd.as_bytes().to_vec()),
				}).expect("Failed to save password");
			}

			println!("{}", pwd);
		},
		_ => panic!("Unknown command!"),
	}
}
