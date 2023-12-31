import sharp from "sharp";
import fs from "fs";
import util from "util";
import { fileURLToPath } from "url";
import { dirname } from "path";
import exifReader from "exifreader";
const exifErrors = exifReader.errors;

// TODO don't upscale

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readFile = util.promisify(fs.readFile);
const readDir = util.promisify(fs.readdir);

const OUTPUT_SIZES = [
    {
        size: "500px",
        px: 500
    },
    {
        size: "1000px",
        px: 1000
    },
    {
        size: "2000px",
        px: 2000
    }
];
// const OUTPUT_SIZES = [
//     {
//         size: "sm",
//         px: 500
//     },
//     {
//         size: "md",
//         px: 1000
//     },
//     {
//         size: "lg",
//         px: 2000
//     }
// ];
const OUTPUT_FORMAT_OPTIONS = [
    {
        format: "jpeg",
        options: {
            quality: 80,
            progressive: true,
            optimizeScans: true
        }
    },
    {
        format: "webp",
        options: {
            quality: 80,
            reductionEffort: 6
        }
    }
];

function getStuff() {
    return readFile("test");
}

function listTags(tags) { }

function getTagsObj(tags = {}) {
    return Object.entries(tags).reduce((accum, [key, val]) => {
        accum[key] = val.description;
        return accum;
    });
}

async function exifToHTMLMeta(path, filename) {
    return new Promise(async (res, rej) => {
        let file;
        try {
            file = await readFile(path);
        } catch (error) {
            if (error) {
                console.error("Error reading file.");
                process.exit(1);
            }
        }

        let tags;
        try {
            tags = exifReader.load(file);

            // The MakerNote tag can be really large. Remove it to lower memory
            // usage if you're parsing a lot of files and saving the tags.
            delete tags["MakerNote"];
        } catch (error) {
            if (error instanceof exifErrors.MetadataMissingError) {
                console.log("No Exif data found");
            }

            console.error(error);
            process.exit(1);
        }

        const {
            title,
            description,
            subject,
            Make,
            Model,
            DateTime,
            creator,
            rights,
            ExposureTime,
            DateTimeOriginal,
            OffsetTime,
            DateCreated,
            ApertureValue,
            ColorSpace,
            Lens,
            ModifyDate,
            GPSLatitude,
            GPSLatitudeRef,
            GPSLongitude,
            GPSLongitudeRef,
            GPSAltitude,
            GPSImgDirection,
            City,
            ...otherTags
        } = getTagsObj(tags);

        // Prefix lat/lng with negative signs where needed.
        const lat = (GPSLatitudeRef && !!GPSLatitudeRef.match(/south/i)) ? `-${GPSLatitude}` : GPSLatitude;
        const lng = (GPSLongitudeRef && !!GPSLongitudeRef.match(/west/i)) ? `-${GPSLongitude}` : GPSLongitude;

        res(`
{{< img
    src="${filename}"
    width="2000"
    height="1500"
    title="${title}"
    caption="${description}"
    genre="Travel Photography"
    latitude="${GPSLatitude}"
    longitude="${GPSLongitude}"
    altitudeMeters="${GPSAltitude}"
    location="${City}, ${otherTags["Province/State"]}, ${otherTags["Country/Primary Location Code"]
            }"
    keywords="${subject}"
    dateCreated="${DateCreated}${OffsetTime ? OffsetTime : ""}"
    dateModified="${ModifyDate}"
>}}`);
    });
}

async function processFilesInDir(dir) {
    return new Promise(async (resolve, reject) => {
        let files;
        try {
            files = await readDir(dir);
        } catch (e) {
            console.error(e);
        }

        let allMeta = "";

        files.forEach(async function (file) {
            const isJPEG = file.endsWith(".jpg") || file.endsWith(".jpeg");
            const isHEIC = file.toLowerCase().endsWith(".heic");
            const isAlreadyResized =
                file.endsWith("-resize.jpg") || file.endsWith("-resize.jpeg");

            if ((isJPEG || isHEIC) && !isAlreadyResized) {
                const [name] = file.split(".jpg");

                // Convert metadata to HTML tags
                const meta = await exifToHTMLMeta(`${dir}/${file}`, file);
                allMeta += meta;
                console.log(111, meta)

                OUTPUT_SIZES.forEach(({ px, size }) => {
                    OUTPUT_FORMAT_OPTIONS.forEach(({ format, options }) => {
                        const image = sharp(`${dir}/${file}`);
                        image.metadata().then(function (metadata) {
                            const { width, height } = metadata;

                            if (width >= height) {
                                // horiz / landscape

                                const outputRequiresUpscale = width < px;
                                let resizeWidth = px;
                                if (outputRequiresUpscale) {
                                    console.log(`Original width ${width}px too small to upscale to ${px}.`);
                                    resizeWidth = width;
                                }

                                return image
                                    .resize({ width: resizeWidth })
                                [format](options)
                                    .toFile(
                                        `${dir}/${name}-${size}-resize.${format}`,
                                        (err, info) => {
                                            if (err) {
                                                console.error(
                                                    `Problem processing ${file}`
                                                );
                                                console.error(err);
                                            }
                                        }
                                    );
                            } else {
                                // vert / portrait

                                const outputRequiresUpscale = height < px;
                                let resizeHeight = px;
                                if (outputRequiresUpscale) {
                                    console.log(`Original width ${height}px too small to upscale to ${px}.`);
                                    resizeHeight = height;
                                }

                                return image
                                    .resize({ height: resizeHeight })
                                [format](options)
                                    .toFile(
                                        `${dir}/${name}-${size}-resize.${format}`,
                                        (err, info) => {
                                            if (err) {
                                                console.error(
                                                    `Problem processing ${file}`
                                                );
                                                console.error(err);
                                            }
                                        }
                                    );
                            }
                        });
                    });
                });
            }
        });
        resolve(allMeta);
    });
}

async function init() {
    const tags = await processFilesInDir(`${__dirname}/test`);
}
init();

