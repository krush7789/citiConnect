import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'src');

const replacements = {
    // Layout
    '@/components/MainLayout': '@/components/layout/MainLayout',
    '@/components/AdminLayout': '@/components/layout/AdminLayout',
    '@/components/ProtectedRoute': '@/components/layout/ProtectedRoute',
    '@/components/Navbar': '@/components/layout/Navbar',
    '@/components/Footer': '@/components/layout/Footer',
    '@/components/ProfileDrawer': '@/components/layout/ProfileDrawer',
    // Common
    '@/components/PaginationControls': '@/components/common/PaginationControls',
    '@/components/FilterRow': '@/components/common/FilterRow',
    '@/components/HeroCarousel': '@/components/common/HeroCarousel',
    '@/components/HorizontalCardCarousel': '@/components/common/HorizontalCardCarousel',
    '@/components/SearchModal': '@/components/common/SearchModal',
    '@/components/SortFilterModal': '@/components/common/SortFilterModal',
    // Auth
    '@/components/LoginModal': '@/components/auth/LoginModal',
    '@/components/RegisterModal': '@/components/auth/RegisterModal',
    '@/components/ForgotPasswordModal': '@/components/auth/ForgotPasswordModal',
    '@/components/ChangePasswordModal': '@/components/auth/ChangePasswordModal',
    '@/components/ForceChangePasswordModal': '@/components/auth/ForceChangePasswordModal',
    // Domain
    '@/components/MovieCard': '@/components/domain/MovieCard',
    '@/components/EventCard': '@/components/domain/EventCard',
    '@/components/SeatMap': '@/components/domain/SeatMap',
    '@/components/VenueMap': '@/components/domain/VenueMap',
    '@/components/ArtistRow': '@/components/domain/ArtistRow',
    '@/components/LocationPickerMap': '@/components/domain/LocationPickerMap',
};

function processDirectory(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                processDirectory(fullPath);
            } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let modified = false;

                for (const [oldImport, newImport] of Object.entries(replacements)) {
                    // Use a regex that properly replaces the exact path:
                    // We need double-escaped dots if there are any, but here it's alphabetical.
                    // Look for 'oldImport' followed by a quote.
                    const oldImportEscaped = oldImport.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regexStr = "(['\"`])" + oldImportEscaped + "(['\"`])";
                    const regex = new RegExp(regexStr, 'g');

                    if (regex.test(content)) {
                        content = content.replace(regex, `$1${newImport}$2`);
                        modified = true;
                    }
                }

                if (modified) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Updated imports in ${fullPath}`);
                }
            }
        }
    } catch (e) {
        console.error("Error processing " + dir, e);
    }
}

try {
    processDirectory(srcDir);
    console.log('Finished updating imports.');
} catch (e) {
    console.error("Main error:", e);
}
