import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";



export async function GET(req: Request) {

    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if(data.user == null){
        return new Response("Unauthorized", { status: 401 });
    }

    const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*");


    if(productsError){
        return NextResponse.json({error : "Internal  Server Error"},{status : 500});
    }

    return NextResponse.json({products : products},{status : 200});

}
