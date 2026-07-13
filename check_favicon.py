from PIL import Image

img = Image.open('e:\\speaklabs\\favicon-32x32.png').convert('L')
width, height = img.size

ascii_chars = " .:-=+*#%@"
ascii_str = ""

for y in range(0, height, 2):
    for x in range(width):
        pixel = img.getpixel((x, y))
        # invert so black is '@'
        val = 255 - pixel
        char_idx = int((val / 255.0) * (len(ascii_chars) - 1))
        ascii_str += ascii_chars[char_idx]
    ascii_str += "\n"

print(ascii_str)
