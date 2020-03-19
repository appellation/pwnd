#[macro_use]
extern crate clap;

#[macro_use]
extern crate arrayref;

mod local;
mod sync;

use clap::App;
use local::{SqliteStore};
use sync::LocalClient;
use pwnd::{
	secret::{KeyPair, Secret, SecretStore, StaticSecret},
	random,
	sync::Client
};
use std::fs;

fn main() {
	let yml = load_yaml!("cli.yml");
	let mut app = App::from_yaml(yml);
	let matches = app.clone().get_matches();

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

	let secret_store = SqliteStore::new("pwd.sqlite3", &kp);
	let client = LocalClient{};

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

			let charset = match args.value_of("range") {
				Some("alpha") => random::ALPHA.to_owned(),
				Some("numeric") => random::NUMERIC.to_owned(),
				Some("alphanumeric") => random::ALPHA.to_owned() + random::NUMERIC,
				_ => random::ALL.to_owned(),
			};

			let pwd = random::random_string(len, &charset);

			if let Some(name) = args.value_of("name") {
				secret_store.add(&Secret{
					id: 0,
					name: name.to_string(),
					value: Some(pwd.as_bytes().to_vec()),
				}).expect("Failed to save password");
			}

			println!("{}", pwd);
		},
		("sync", Some(_)) => {
			let qr = client.qr_code(&kp).expect("Failed to generate QR code");
			let image = qr.render::<char>()
				.module_dimensions(2, 1)
				.build();

			println!("{}", image);
		},
		_ => {
			println!("Unknown command!\n");
			app.print_long_help().expect("Unable to print help. :(");
		},
	}
}
