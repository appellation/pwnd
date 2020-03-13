#![recursion_limit="256"]

extern crate pwnd;
extern crate wasm_bindgen;
extern crate yew;

use wasm_bindgen::prelude::*;
use yew::events::*;
use yew::prelude::*;

struct Model {
	link: ComponentLink<Self>,
	password_length: usize,
	random_password: String,
}

enum Msg {
	RegeneratePassword,
	SetPasswordLength(usize),
}

impl Component for Model {
	type Message = Msg;
	type Properties = ();
	fn create(_: Self::Properties, link: ComponentLink<Self>) -> Self {
		Self {
			link,
			password_length: 32,
			random_password: pwnd::util::random_string(32),
		}
	}

	fn update(&mut self, msg: Self::Message) -> ShouldRender {
		match msg {
			Msg::RegeneratePassword => self.random_password = pwnd::util::random_string(self.password_length),
			Msg::SetPasswordLength(value) => self.password_length = value,
		}
		true
	}

	fn view(&self) -> Html {
		html! {
			<div>
				<label for="password_length">{ "Password Length" }</label>
				<input id="password_length" type="number" value=self.password_length onchange=self.link.callback(|evt: ChangeData| match evt {
					ChangeData::Value(value) => Msg::SetPasswordLength(value.parse::<usize>().unwrap()),
					_ => panic!("Unexpected data for change event"),
				}) />
				<br />
				<button onclick=self.link.callback(|_| Msg::RegeneratePassword)>{ "Regenerate" }</button>
				<input type="text" readonly=true value=self.random_password />
			</div>
		}
	}
}

#[wasm_bindgen]
pub fn run() {
	yew::initialize();
	App::<Model>::new().mount_to_body();
}
