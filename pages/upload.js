import { supabase } from '../utils/supabaseClient';

async function testUploadAvatar() {
  // 1️⃣ Recupera utente autenticato
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('Devi essere loggato per testare l’upload');
    return;
  }

  // 2️⃣ Simula upload di un file locale (es. un PNG fittizio)
  const file = new File(["Hello Avatar!"], "avatar-test.png", { type: "image/png" });
  const filePath = `avatars/${user.id}/profile-${Date.now()}.png`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (error) console.error('Errore upload:', error);
  else console.log('Upload riuscito:', data);

  // 3️⃣ Ottieni URL pubblico
  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  console.log('URL pubblico:', publicUrlData.publicUrl);
}

testUploadAvatar();
