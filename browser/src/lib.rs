extern crate wasm_bindgen;
extern crate yew;

use wasm_bindgen::prelude::*;
use yew::prelude::*;

struct Model {
	link: ComponentLink<Self>,
	value: i64,
}

enum Msg {
	AddOne,
}

impl Component for Model {
	type Message = Msg;
	type Properties = ();
	fn create(_: Self::Properties, link: ComponentLink<Self>) -> Self {
		Self {
			link,
			value: 0,
		}
	}

	fn update(&mut self, msg: Self::Message) -> ShouldRender {
		match msg {
			Msg::AddOne => self.value += 1
		}
		true
	}

	fn view(&self) -> Html {
		html! {
			<div>
				<button onclick=self.link.callback(|_| Msg::AddOne)>{ "+1" }</button>
				<p>{ self.value }</p>
			</div>
		}
	}
}

#[wasm_bindgen]
pub fn run() {
	yew::initialize();
	App::<Model>::new().mount_to_body();
}
