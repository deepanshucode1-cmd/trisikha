import { createClient } from "./supabase/server";


const retry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await fn();
        } catch (error) {
            attempt++;
            if (attempt >= retries) {
                throw error;
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw new Error('Retry attempts exhausted');
};

export default retry;

export const retryPaymentUpdateStatus = async (status : string , orderId : string, retries = 3, delay = 1000): Promise<void> => {
    let attempt = 0;
    while (attempt < retries) {
        try {
            const supabase = await createClient();
            
            const {data,error} =  await supabase
                .from('orders')
                .update({ status: status})
                .eq('id', orderId);

                if(error && attempt < retries){
                    attempt++; 
                }else{
                    return;
                }
        } catch (error) {
            attempt++;
            if (attempt >= retries) {
                throw error;
            }
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw new Error('Retry attempts exhausted for payment update status');
};