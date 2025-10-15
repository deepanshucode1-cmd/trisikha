"use client";
import { createBrowserClient } from '@supabase/ssr';
import imageCompression from 'browser-image-compression';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { v4 as uuidv4 } from "uuid";
import ProgressBar from './ProgressBar';
import { createClient } from '@/utils/supabase/client';

interface UploadUrlProps {
  setUrl : (url : string) => void
  initial_image_url : string  
}

const AvatarUpload = ({  setUrl,initial_image_url }: UploadUrlProps) => {
  const [imageUrls, setImageUrls] = useState<string>("");

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [imageSrc, setImageSrc] = useState<string|null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string|null>(null);

  useEffect(() => {
    setImageSrc(initial_image_url);
    console.log("setting image url: ",initial_image_url);
  },[initial_image_url]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const newImageUrls =  URL.createObjectURL(file);

      setImageUrls(newImageUrls);

      const reader = new FileReader();
      reader.onload = (er) => {
        if( er.target != null){
        setImageSrc(er.target?.result as string);
        }
      };
      reader.readAsDataURL(e.target.files[0]);

    }
  };

  const [isPending, setIsPending] = useState(false);


  const uploadImages = async () => {
        setIsPending(true);
        const imageFile = await convertBlobUrlToFile(imageUrls);

        const { imageUrl, error } = await uploadImage({
          file: imageFile,
          bucket: "images",
        });

        if (error) {
          setIsPending(false);
          toast.error(error);
          console.error(error);
          return;
        }

        setUrl(imageUrl);
        setUploadedUrl(imageUrl);
        
      setImageUrls("");
      setIsPending(false);
  };

  return (
    <div className="w-full h-full">
  <ToastContainer />
  <div className="flex items-center justify-center">
    <div className="relative w-full h-full overflow-hidden">
      <input
        type="file"
        accept="image/png, image/jpeg, image/webp"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
        onChange={handleFileChange}
      />

      {imageSrc ? (
        <div className="relative w-full h-[400px] overflow-hidden">
          <img
            src={imageSrc}
            alt="Profile"
            className="object-cover w-full h-full"
          />
          <label
            htmlFor="profileImage"
            className="absolute bottom-1 right-1 bg-gray-800 text-white p-1 rounded-full cursor-pointer hover:bg-gray-600 transition"
          >
            📷
          </label>
          <input type="file" id="profileImage" className="hidden" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1"
            stroke="currentColor"
            className="w-6 h-6 text-gray-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
            />
          </svg>
        </div>
      )}
    </div>
  </div>

  {isPending ? (
    <div className="flex justify-center py-10">
      <ProgressBar />
    </div>
  ) : (
    imageUrls.length !== 0 && (
      <div className="w-full flex justify-center">
        <button
          type="button"
          onClick={uploadImages}
          disabled={isPending}
          className="btn btn-primary text-grey font-semibold py-2 px-4 mt-6 rounded focus:outline-none transition ease-in-out duration-300"
        >
          Upload
        </button>
      </div>
    )
  )}
</div>
  );
};

export default AvatarUpload;


function getStorage() {
  const { storage } = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
  return storage;
}

type UploadProps = {
  file: File;
  bucket: string;
  folder?: string;
};

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

const isValidFileExtension = (fileName: string) => {
  const fileExtension = fileName.slice(fileName.lastIndexOf('.'));
  return allowedExtensions.includes(fileExtension);
};

function getFileSignature(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (reader.result instanceof ArrayBuffer) {
        const arr = new Uint8Array(reader.result);
        const hex = Array.from(arr.slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
        resolve(hex.toUpperCase());
      } else {
        reject(new Error("FileReader result is not an ArrayBuffer"));
        return;
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(0, 4)); // Read first 4 bytes
  });
}

async function isImageFile(file: File) {
  const signature = await getFileSignature(file);
  return signature === 'FF D8 FF E0' || signature === 'FF D8 FF E1' || signature === '89 50 4E 47' || signature === '52 49 46 46';
}

export const uploadImage = async ({ file, bucket, folder }: UploadProps) => {
  const fileName = file.name;
  if (!isValidFileExtension(fileName)) {
    return { imageUrl: "", error: "Invalid file type" };
  }
  if (!isImageFile(file)) {
    return { imageUrl: "", error: "File is not a valid image" };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { imageUrl: "", error: "File size exceeds 5MB" };
  }

  const fileExtension = fileName.slice(fileName.lastIndexOf(".") + 1);
  const path = `${folder ? folder + "/" : ""}${uuidv4()}.${fileExtension}`;

  try {
    file = await imageCompression(file, {
      maxSizeMB: 1,
    });
  } catch (error) {
    console.error(error);
    return { imageUrl: "", error: "Image compression failed" };
  }

  const storage = createClient().storage;

  const { data, error } = await storage.from(bucket).upload(path, file);

  if (error) {
    console.error(error);
    return { imageUrl: "", error: "Image upload failed" };
  }

  const imageUrl = `${process.env
    .NEXT_PUBLIC_SUPABASE_URL!}/storage/v1/object/public/${bucket}/${
    data?.path
  }`;

  return { imageUrl, error: "" };
};


export async function convertBlobUrlToFile(blobUrl: string) {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const fileName = Math.random().toString(36).slice(2, 9);
  const mimeType = blob.type || "application/octet-stream";
  const file = new File([blob], `${fileName}.${mimeType.split("/")[1]}`, {
    type: mimeType,
  });
  return file;
}
