import sourcemaps from 'rollup-plugin-sourcemaps';
import pkg from './package.json';

function onwarn(message) {
  const suppressed = ['UNRESOLVED_IMPORT', 'THIS_IS_UNDEFINED'];

  if (!suppressed.find(code => message.code === code)) {
    return console.warn(message.message);
  }
}

export default [
	{
		input: 'lib/index.js',
		onwarn,
		output: [
			{
				file: pkg.main,
				format: 'umd',
				name: 'melonJs',
				sourcemap: true,
				exports: 'named',
			},
		],
		plugins: [sourcemaps()],
	},
];
