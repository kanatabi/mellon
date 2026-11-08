import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ photos: await createApi().listPhotos() });
