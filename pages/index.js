import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase.from('test_table').select('*');
      if (error) console.error('Errore Supabase:', error.message);
      else setData(data);
    };
    fetchData();
  }, []);

  return (
    <div style={{ fontFamily: 'Arial', padding: '20px' }}>
      <h1>✅ TalentLix connesso a Supabase!</h1>
      <h2>Dati dalla tabella di test:</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
