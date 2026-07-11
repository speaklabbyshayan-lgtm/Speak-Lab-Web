from PIL import Image
import sys

def create_favicons(input_path, output_dir):
    try:
        # Open the uploaded image
        img = Image.open(input_path)
        
        # Ensure image is in RGBA mode for transparency/consistency
        img = img.convert("RGBA")
        
        # Generate sizes for icon
        icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
        img.save(f"{output_dir}/favicon.ico", format='ICO', sizes=icon_sizes)
        print("Generated favicon.ico")
        
        # Generate 32x32 PNG
        img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
        img_32.save(f"{output_dir}/favicon-32x32.png", format='PNG')
        print("Generated favicon-32x32.png")
        
        # Generate 180x180 Apple Touch Icon
        img_180 = img.resize((180, 180), Image.Resampling.LANCZOS)
        # Apple touch icon should preferably be RGB (no alpha) and fill background if it was transparent, 
        # but RGBA will work. Let's composite it on a white background just in case.
        bg = Image.new("RGB", img_180.size, (255, 255, 255))
        bg.paste(img_180, mask=img_180.split()[3]) # paste using alpha channel as mask
        bg.save(f"{output_dir}/apple-touch-icon.png", format='PNG')
        print("Generated apple-touch-icon.png")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    input_image = r"C:\Users\ahsan\.gemini\antigravity-ide\brain\a0c05124-d3da-4e23-b7e4-d8dca529d665\media__1783795201497.jpg"
    output_directory = r"e:\speaklabs"
    create_favicons(input_image, output_directory)
