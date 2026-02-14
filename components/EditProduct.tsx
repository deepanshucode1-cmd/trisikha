/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { createClient } from "@/utils/supabase/client";
import React, { useEffect, useState } from "react";
import AvatarUpload from "./AvatarUpload";
import ProgressBar from "./ProgressBar";

type IdType = {
  id: string;
};

const inputClass =
  "w-full p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-[#3d3c30] focus:outline-none transition";

const EditProduct = ({ id }: IdType) => {
  // Basic fields
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [hsn, setHsn] = useState("");
  const [sku, setSku] = useState("");
  const [length, setLength] = useState("");
  const [breadth, setBreadth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");

  // Legal metrology fields
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerAddress, setManufacturerAddress] = useState("");
  const [netQuantity, setNetQuantity] = useState("");

  // Technical specifications
  const [npkNitrogen, setNpkNitrogen] = useState("");
  const [npkPhosphorus, setNpkPhosphorus] = useState("");
  const [npkPotassium, setNpkPotassium] = useState("");
  const [organicMatter, setOrganicMatter] = useState("");
  const [moistureContent, setMoistureContent] = useState("");
  const [phValue, setPhValue] = useState("");
  const [cnRatio, setCnRatio] = useState("");
  const [testCertNumber, setTestCertNumber] = useState("");
  const [testCertDate, setTestCertDate] = useState("");
  const [testingLab, setTestingLab] = useState("");
  const [mfgLicense, setMfgLicense] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [batchLot, setBatchLot] = useState("");
  const [bestBefore, setBestBefore] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Section toggles
  const [showMetrology, setShowMetrology] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      const supabase = createClient();

      const [productRes, specsRes] = await Promise.all([
        supabase.from("products").select("*").eq("id", id).single(),
        supabase
          .from("product_specifications")
          .select("*")
          .eq("product_id", id)
          .maybeSingle(),
      ]);

      setLoading(false);

      if (productRes.error) {
        setMessage(`❌ ${productRes.error.message}`);
        return;
      }

      const product = productRes.data;
      if (product) {
        setName(product.name || "");
        setPrice(product.price?.toString() || "");
        setStock(product.stock?.toString() || "");
        setImageUrl(product.image_url || "");
        setHsn(product.hsn || "");
        setSku(product.sku || "");
        setLength(product.length?.toString() || "");
        setBreadth(product.breadth?.toString() || "");
        setHeight(product.height?.toString() || "");
        setWeight(product.weight?.toString() || "");
        setDescription(product.description || "");
        setCountryOfOrigin(product.country_of_origin || "");
        setManufacturerName(product.manufacturer_name || "");
        setManufacturerAddress(product.manufacturer_address || "");
        setNetQuantity(product.net_quantity || "");
      }

      const specs = specsRes.data;
      if (specs) {
        setNpkNitrogen(specs.npk_nitrogen_percent?.toString() || "");
        setNpkPhosphorus(specs.npk_phosphorus_percent?.toString() || "");
        setNpkPotassium(specs.npk_potassium_percent?.toString() || "");
        setOrganicMatter(specs.organic_matter_percent?.toString() || "");
        setMoistureContent(specs.moisture_content_percent?.toString() || "");
        setPhValue(specs.ph_value?.toString() || "");
        setCnRatio(specs.cn_ratio?.toString() || "");
        setTestCertNumber(specs.test_certificate_number || "");
        setTestCertDate(specs.test_certificate_date || "");
        setTestingLab(specs.testing_laboratory || "");
        setMfgLicense(specs.manufacturing_license || "");
        setShelfLife(specs.shelf_life_months?.toString() || "");
        setBatchLot(specs.batch_lot_number || "");
        setBestBefore(specs.best_before_date || "");
        setShowSpecs(true);
      }
    };

    fetchProduct();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !price || !stock || !imageUrl) {
      setMessage("⚠️ Please fill all required fields");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      // Update product
      const { error: dbError } = await supabase
        .from("products")
        .update({
          name,
          price: Number(price),
          stock: Number(stock),
          image_url: imageUrl,
          hsn,
          sku,
          length: Number(length) || null,
          breadth: Number(breadth) || null,
          height: Number(height) || null,
          weight: Number(weight) || null,
          description,
          country_of_origin: countryOfOrigin || null,
          manufacturer_name: manufacturerName || null,
          manufacturer_address: manufacturerAddress || null,
          net_quantity: netQuantity || null,
        })
        .eq("id", id);

      if (dbError) throw dbError;

      // Upsert specs if any field is filled
      const hasSpecs =
        npkNitrogen || npkPhosphorus || npkPotassium || organicMatter ||
        moistureContent || phValue || cnRatio || testCertNumber ||
        testCertDate || testingLab || mfgLicense || shelfLife ||
        batchLot || bestBefore;

      if (hasSpecs) {
        const specsData = {
          product_id: id,
          npk_nitrogen_percent: npkNitrogen ? Number(npkNitrogen) : null,
          npk_phosphorus_percent: npkPhosphorus ? Number(npkPhosphorus) : null,
          npk_potassium_percent: npkPotassium ? Number(npkPotassium) : null,
          organic_matter_percent: organicMatter ? Number(organicMatter) : null,
          moisture_content_percent: moistureContent ? Number(moistureContent) : null,
          ph_value: phValue ? Number(phValue) : null,
          cn_ratio: cnRatio ? Number(cnRatio) : null,
          test_certificate_number: testCertNumber || null,
          test_certificate_date: testCertDate || null,
          testing_laboratory: testingLab || null,
          manufacturing_license: mfgLicense || null,
          shelf_life_months: shelfLife ? Number(shelfLife) : null,
          batch_lot_number: batchLot || null,
          best_before_date: bestBefore || null,
        };

        const { error: specsError } = await supabase
          .from("product_specifications")
          .upsert(specsData, { onConflict: "product_id" });

        if (specsError) throw specsError;
      }

      setMessage("✅ Product updated successfully!");
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f6f5ef] to-[#e8e6da] py-8">
      {!loading && (
        <div className="w-full max-w-lg bg-white p-8 rounded-2xl shadow-lg border border-[#ece8d5]">
          <h1 className="text-3xl font-bold text-center mb-8 text-[#3d3c30]">
            Edit Product
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Product Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                placeholder="Enter product name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Price and Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (₹) *
                </label>
                <input
                  type="number"
                  placeholder="Price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock *
                </label>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* SKU and HSN */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU
                </label>
                <input
                  type="text"
                  placeholder="Enter SKU"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  placeholder="Enter HSN Code"
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Length (cm)
                </label>
                <input
                  type="number"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Breadth (cm)
                </label>
                <input
                  type="number"
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (g)
              </label>
              <input
                type="number"
                placeholder="Enter weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                placeholder="Enter product description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputClass} h-24 resize-none`}
              />
            </div>

            {/* Image Upload */}
            <div className="flex flex-col items-center mt-4">
              <AvatarUpload
                setUrl={(url: string) => setImageUrl(url)}
                initial_image_url={imageUrl}
              />
            </div>

            {/* Legal Metrology Section */}
            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setShowMetrology(!showMetrology)}
                className="flex items-center justify-between w-full text-left text-sm font-semibold text-[#3d3c30]"
              >
                Legal Metrology
                <span className="text-lg">{showMetrology ? "−" : "+"}</span>
              </button>

              {showMetrology && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country of Origin
                      </label>
                      <input
                        type="text"
                        placeholder="India"
                        value={countryOfOrigin}
                        onChange={(e) => setCountryOfOrigin(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Net Quantity
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 5 kg"
                        value={netQuantity}
                        onChange={(e) => setNetQuantity(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Manufacturer Name
                    </label>
                    <input
                      type="text"
                      placeholder="Manufacturer name"
                      value={manufacturerName}
                      onChange={(e) => setManufacturerName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Manufacturer Address
                    </label>
                    <textarea
                      placeholder="Full manufacturer address"
                      value={manufacturerAddress}
                      onChange={(e) => setManufacturerAddress(e.target.value)}
                      className={`${inputClass} h-20 resize-none`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Technical Specifications Section */}
            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setShowSpecs(!showSpecs)}
                className="flex items-center justify-between w-full text-left text-sm font-semibold text-[#3d3c30]"
              >
                Technical Specifications
                <span className="text-lg">{showSpecs ? "−" : "+"}</span>
              </button>

              {showSpecs && (
                <div className="mt-4 space-y-4">
                  {/* NPK */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      NPK Content (%)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nitrogen
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="N %"
                          value={npkNitrogen}
                          onChange={(e) => setNpkNitrogen(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phosphorus
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="P %"
                          value={npkPhosphorus}
                          onChange={(e) => setNpkPhosphorus(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Potassium
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="K %"
                          value={npkPotassium}
                          onChange={(e) => setNpkPotassium(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Composition */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Organic Matter (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={organicMatter}
                        onChange={(e) => setOrganicMatter(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Moisture (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={moistureContent}
                        onChange={(e) => setMoistureContent(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        pH Value
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0-14"
                        value={phValue}
                        onChange={(e) => setPhValue(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        C:N Ratio
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={cnRatio}
                        onChange={(e) => setCnRatio(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Certification */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Test Certificate
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Certificate No.
                        </label>
                        <input
                          type="text"
                          value={testCertNumber}
                          onChange={(e) => setTestCertNumber(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Certificate Date
                        </label>
                        <input
                          type="date"
                          value={testCertDate}
                          onChange={(e) => setTestCertDate(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Testing Laboratory
                      </label>
                      <input
                        type="text"
                        placeholder="Lab name"
                        value={testingLab}
                        onChange={(e) => setTestingLab(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* License & Shelf Life */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mfg. License No.
                      </label>
                      <input
                        type="text"
                        value={mfgLicense}
                        onChange={(e) => setMfgLicense(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Shelf Life (months)
                      </label>
                      <input
                        type="number"
                        value={shelfLife}
                        onChange={(e) => setShelfLife(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Batch/Lot No.
                      </label>
                      <input
                        type="text"
                        value={batchLot}
                        onChange={(e) => setBatchLot(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Best Before
                      </label>
                      <input
                        type="date"
                        value={bestBefore}
                        onChange={(e) => setBestBefore(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#3d3c30] text-[#e0dbb5] rounded-md font-medium hover:bg-[#4b493e] transition disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </form>

          {/* Message */}
          {message && (
            <p
              className={`mt-5 text-center text-sm ${
                message.startsWith("✅")
                  ? "text-green-600"
                  : message.startsWith("⚠️")
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="w-full h-full flex items-center justify-center">
          <ProgressBar />
        </div>
      )}
    </div>
  );
};

export default EditProduct;
