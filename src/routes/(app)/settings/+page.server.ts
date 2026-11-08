import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies }) => ({
	vim: cookies.get('mellon_vim') === '1'
});

export const actions: Actions = {
	default: async ({ cookies, request }) => {
		const form = await request.formData();
		// Non-httpOnly: the editor reads it at init to choose keymaps.
		if (form.get('vim') === '1') {
			cookies.set('mellon_vim', '1', { path: '/', sameSite: 'strict', maxAge: 31536000 });
		} else {
			cookies.delete('mellon_vim', { path: '/' });
		}
	}
};
