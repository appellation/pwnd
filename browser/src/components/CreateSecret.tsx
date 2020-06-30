import cryptoRandomString from 'crypto-random-string';
import { Formik, Field, FormikProps } from 'formik';
import { SecretType, Secret, FieldType } from 'pwnd-core';

export interface CreateSecretProps {
	type: SecretType;
}

function hiddenFieldExtras(i: number, j: number, props: FormikProps<Secret>): JSX.Element {
	return (
		<>
			<button type="button" onClick={() => props.setFieldValue(`data.${i}.fields.${j}.value`, cryptoRandomString({ length: 10 }))}>Regenerate</button>
		</>
	);
}

export default function CreateSecret(props: CreateSecretProps) {
	let secret: Secret;
	switch (props.type) {
		case SecretType.LOGIN:
			secret = Secret.createLogin('', '', '');
			break;
		case SecretType.EMPTY:
			secret = Secret.createEmpty('');
			break;
		default:
			throw new Error('unexpected secret type');
	}

	return (
		<Formik
			initialValues={secret}
			onSubmit={() => {}}
		>
			{props =>
				<form onSubmit={props.handleSubmit} onReset={props.handleReset}>
					<label htmlFor="name">Name</label>
					<Field type="text" id="name" name="name" />
					{props.values.data.map((section, i) => (
						<div key={section.name}>
							<h1>{section.name}</h1>
							{section.fields.map((field, j) => (
								<div key={field.name}>
									<label htmlFor={field.name}>{field.name}</label>
									<Field name={`data.${i}.fields.${j}.value`} id={field.name} {...field.formAttributes} />
									{field.type === FieldType.HIDDEN ? hiddenFieldExtras(i, j, props) : ''}
								</div>
							))}
						</div>
					))}
				</form>
			}
		</Formik>
	);
}
