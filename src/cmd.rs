extern crate clap;
extern crate rand;

use clap::ArgMatches;
use pwd_core::util;

pub fn generate(args: &ArgMatches) {
	let len: usize = match args.value_of("length") {
		Some(val) => match val.parse() {
			Ok(v) => v,
			Err(_) => panic!("Non-number provided for length!"),
		},
		None => 24,
	};

	let pwd = util::random_string(len);
	println!("{}", pwd);
}
